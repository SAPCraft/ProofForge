import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import StatusBadge from '../../components/StatusBadge.jsx';

const STEP_STATUSES = ['not_started', 'in_progress', 'passed', 'passed_with_comments', 'failed', 'blocked', 'skipped'];
const VAL_STATUSES = ['pending', 'passed', 'failed', 'waived'];
const RUN_STATUSES = ['planned', 'in_progress', 'completed', 'blocked', 'cancelled'];

export default function RunExecute() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [run, setRun] = useState(null);
  const [activeStep, setActiveStep] = useState(null);
  const [comment, setComment] = useState('');
  const [valName, setValName] = useState('');
  const [defects, setDefects] = useState([]);
  const [sapDocType, setSapDocType] = useState('Cash Document');
  const [sapDocNum, setSapDocNum] = useState('');
  const [pastedImages, setPastedImages] = useState([]);
  const [sapDocs, setSapDocs] = useState({});
  const [sapSystems, setSapSystems] = useState([]);
  const fileRef = useRef(null);

  const load = async () => {
    const r = await api.get(`/runs/${id}`);
    setRun(r);
    if (!activeStep && r.step_executions?.length > 0) {
      const firstPending = r.step_executions.find((s) => s.current_status === 'not_started' || s.current_status === 'in_progress');
      setActiveStep(firstPending?.step_id || r.step_executions[0].step_id);
    }
    // Load saved SAP payloads into display state
    const saved = {};
    for (const se of (r.step_executions || [])) {
      for (const att of (se.attempts || [])) {
        if (att.sap_payloads) {
          for (const [key, payload] of Object.entries(att.sap_payloads)) {
            saved[key] = payload;
          }
        }
      }
    }
    if (Object.keys(saved).length > 0) setSapDocs((prev) => ({ ...prev, ...saved }));
    const d = await api.get(`/defects?run_id=${id}`);
    setDefects(d);
  };
  useEffect(() => { load(); api.get('/systems').then(setSapSystems); }, [id]);

  if (!run) return <div className="loading">Loading...</div>;

  const snapshot = run.scenario_snapshot;
  const steps = snapshot?.steps || [];

  const getStepDef = (stepId) => steps.find((s) => s.id === stepId) || {};
  const getStepExec = (stepId) => run.step_executions?.find((s) => s.step_id === stepId);
  const getLatestAttempt = (stepExec) => stepExec?.attempts?.[stepExec.attempts.length - 1];

  const handleExecute = async (stepId, status) => {
    await api.post(`/runs/${id}/steps/${stepId}/execute`, { status, comment });
    setComment('');
    load();
  };

  const fetchSapDocument = async (objectType, objectId) => {
    const key = `${objectType}_${objectId}`;
    setSapDocs((prev) => ({ ...prev, [key]: { loading: true } }));
    const sys = run.sap_system;
    if (!sys?.base_url || !sys?.user || !sys?.password) {
      setSapDocs((prev) => ({ ...prev, [key]: { error: 'SAP credentials not configured. Go to Settings → SAP Systems.' } }));
      return;
    }

    const isLocalProxy = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const client = sys.client || '000';
    const auth = btoa(`${sys.user}:${sys.password}`);

    // Try multiple OData services - different SAP systems have different ones activated
    const ODATA_SERVICES = [
      { name: 'API_JOURNALENTRY', path: `/sap/opu/odata/sap/API_JOURNALENTRY_SRV/A_JournalEntryItemBasic?$filter=AccountingDocument eq '${objectId}'&sap-client=${client}&$format=json&$top=50` },
      { name: 'FAC_GL_DOCUMENT', path: `/sap/opu/odata/sap/FAC_GL_DOCUMENT_SRV/GLDocumentHeaderSet('${objectId}')/Items?sap-client=${client}&$format=json` },
      { name: 'API_OPLACCTGDOCITEMCUBE', path: `/sap/opu/odata/sap/API_OPLACCTGDOCITEMCUBE_SRV/A_OperationalAcctgDocItemCube?$filter=AccountingDocument eq '${objectId}'&sap-client=${client}&$format=json&$top=50` },
      { name: 'C_JOURNALENTRYITEM_CDS', path: `/sap/opu/odata/sap/C_JOURNALENTRYITEMQUERY_CDS/C_JournalEntryItemQuery?$filter=AccountingDocument eq '${objectId}'&sap-client=${client}&$format=json&$top=50` },
    ];

    if (isLocalProxy) {
      console.log('[ProofForge] Local proxy mode — trying SAP OData services...');
      let lastError = '';
      for (const svc of ODATA_SERVICES) {
        console.log(`[ProofForge] Trying ${svc.name}...`);
        try {
          const res = await fetch(svc.path, {
            headers: {
              'Authorization': `Basic ${auth}`,
              'Accept': 'application/json',
              'X-SAP-Target': sys.base_url,
            },
          });
          if (res.status === 401) { throw new Error('SAP authentication failed (401). Check user/password in Settings.'); }
          if (!res.ok) {
            const errText = await res.text();
            console.log(`[ProofForge] ${svc.name}: ${res.status}`, errText.slice(0, 200));
            lastError = `${svc.name}: ${res.status}`;
            continue; // try next service
          }
          const data = await res.json();
          const items = data?.d?.results || (data?.d ? [data.d] : []);
          console.log(`[ProofForge] ${svc.name}: SUCCESS — ${items.length} items`);
          const result = { items, fetched_at: new Date().toISOString(), service: svc.name };
          setSapDocs((prev) => ({ ...prev, [key]: result }));
          await saveSapPayload(objectType, objectId, result);
          return; // success - stop trying
        } catch (err) {
          if (err.message.includes('401')) { setSapDocs((prev) => ({ ...prev, [key]: { error: err.message } })); return; }
          console.log(`[ProofForge] ${svc.name}: ${err.message}`);
          lastError = err.message;
        }
      }
      // OData failed — try RFC_READ_TABLE via SOAP
      console.log('[ProofForge] OData services failed. Trying RFC_READ_TABLE via SOAP...');
      try {
        // Pad document number to 10 chars (SAP BELNR is CHAR 10)
        const docNum = objectId.padStart(10, '0');
        console.log('[ProofForge] Document number padded:', objectId, '->', docNum);

        // Fetch FI document: BKPF header + BSEG lines + ACDOCA registers
        const result = { header: null, items: [], acdoca: [], cashJournal: null, fetched_at: new Date().toISOString(), service: 'RFC' };

        // 1. BKPF — extended header
        console.log('[ProofForge] Fetching BKPF header...');
        const bkpfRows = await fetchViaSoapRfc('BKPF',
          ['BUKRS','BELNR','GJAHR','BLART','BUDAT','BLDAT','MONAT','WAERS','KURSF','BKTXT','XBLNR','STBLG','STJAH','BSTAT','USNAM','CPUDT','CPUTM','TCODE','PPNAM','NUMPG','AWTYP','AWKEY'],
          [`BELNR EQ '${docNum}'`],
          sys.base_url, client, auth
        );
        console.log('[ProofForge] BKPF rows:', bkpfRows.length);

        if (bkpfRows.length > 0) {
          bkpfRows.sort((a,b) => (b.GJAHR||'').localeCompare(a.GJAHR||''));
          const hdr = bkpfRows[0];
          result.header = {
            CompanyCode: hdr.BUKRS, AccountingDocument: objectId, FiscalYear: hdr.GJAHR,
            Period: hdr.MONAT, AccountingDocumentType: hdr.BLART,
            PostingDate: hdr.BUDAT, DocumentDate: hdr.BLDAT,
            TransactionCurrency: hdr.WAERS, ExchangeRate: hdr.KURSF,
            DocumentHeaderText: hdr.BKTXT, Reference: hdr.XBLNR,
            ReversalDocument: hdr.STBLG, ReversalYear: hdr.STJAH,
            DocumentStatus: hdr.BSTAT,
            CreatedBy: hdr.USNAM, CreatedOn: hdr.CPUDT, CreatedTime: hdr.CPUTM,
            TransactionCode: hdr.TCODE, EnteredBy: hdr.PPNAM,
            NumberOfPages: hdr.NUMPG,
            ObjectType: hdr.AWTYP, ObjectKey: hdr.AWKEY,
          };

          // 2. BSEG — extended line items
          console.log('[ProofForge] Fetching BSEG lines...');
          const bsegRows = await fetchViaSoapRfc('BSEG',
            ['BUZEI','BSCHL','KOART','HKONT','DMBTR','WRBTR','SHKZG','MWSKZ','TXGRP','SGTXT','ZUONR','PRCTR','KOSTL','KUNNR','LIFNR','MATNR','WERKS','AUFNR','GSBER','VBELN','ZFBDT','ZTERM','ZLSCH','ZLSPR','ANBWA','ANLN1'],
            [`BELNR EQ '${docNum}' AND GJAHR EQ '${hdr.GJAHR}' AND BUKRS EQ '${hdr.BUKRS}'`],
            sys.base_url, client, auth
          );
          console.log('[ProofForge] BSEG rows:', bsegRows.length);

          result.items = bsegRows.map(line => ({
            AccountingDocumentItem: line.BUZEI, PostingKey: line.BSCHL,
            AccountType: line.KOART, GLAccount: line.HKONT,
            DebitAmountInTransCrcy: line.SHKZG === 'S' ? line.WRBTR : '',
            CreditAmountInTransCrcy: line.SHKZG === 'H' ? line.WRBTR : '',
            AmountInCompanyCodeCurrency: line.DMBTR,
            TaxCode: line.MWSKZ, ItemText: line.SGTXT, AssignmentReference: line.ZUONR,
            ProfitCenter: line.PRCTR, CostCenter: line.KOSTL,
            Customer: line.KUNNR, Supplier: line.LIFNR,
            Material: line.MATNR, Plant: line.WERKS, InternalOrder: line.AUFNR,
            BusinessArea: line.GSBER, SalesDocument: line.VBELN,
            BaselineDate: line.ZFBDT, PaymentTerms: line.ZTERM,
            PaymentMethod: line.ZLSCH, PaymentBlock: line.ZLSPR,
            AssetTransType: line.ANBWA, Asset: line.ANLN1,
          }));
        }

        // 3. ACDOCA — universal journal registers (always try, collapsible)
        console.log('[ProofForge] Fetching ACDOCA registers...');
        try {
          const acdocaRows = await fetchViaSoapRfc('ACDOCA',
            ['RLDNR','RBUKRS','BELNR','GJAHR','BUZEI','DOCLN','RACCT','RHCUR','TSL','HSL','DRCRK','KUNNR','LIFNR','PRCTR','KOSTL','RCNTR','KOKRS','RFAREA','SEGMENT','RASSC','RCOMP'],
            [`BELNR EQ '${docNum}'`],
            sys.base_url, client, auth
          );
          if (acdocaRows.length > 0) {
            acdocaRows.sort((a,b) => (b.GJAHR||'').localeCompare(a.GJAHR||''));
            const gjahr = acdocaRows[0].GJAHR;
            result.acdoca = acdocaRows.filter(r => r.GJAHR === gjahr);
            console.log('[ProofForge] ACDOCA rows:', result.acdoca.length);
          }
        } catch (e) { console.log('[ProofForge] ACDOCA skip:', e.message); }

        // 4. Cash Journal header (if Cash Document type)
        if (objectType === 'Cash Document') {
          console.log('[ProofForge] Fetching TCJD (Cash Journal Document)...');
          try {
            const tcjdRows = await fetchViaSoapRfc('TCJD',
              ['BUKRS','CJNR','GJAHR','BELNR','CJDT','CJBV','CJHA','CJSU','CJBK','CJBKA','CJBS','WAERS','CPUDT','USNAM'],
              [`BELNR EQ '${docNum}'`],
              sys.base_url, client, auth
            );
            if (tcjdRows.length > 0) {
              const cj = tcjdRows[0];
              result.cashJournal = {
                CashJournal: cj.CJNR, CompanyCode: cj.BUKRS, FiscalYear: cj.GJAHR,
                DocumentDate: cj.CJDT, BusinessTransaction: cj.CJBV,
                Amount: cj.CJHA, Currency: cj.WAERS,
                TaxAmount: cj.CJSU, BankAccount: cj.CJBK, BankAccountName: cj.CJBKA,
                PostingStatus: cj.CJBS,
                CreatedBy: cj.USNAM, CreatedOn: cj.CPUDT,
              };
              console.log('[ProofForge] Cash Journal:', result.cashJournal.CashJournal);
            }
          } catch (e) { console.log('[ProofForge] TCJD skip:', e.message); }
        }

        // If BKPF was empty but ACDOCA has data, build items from ACDOCA
        if (result.items.length === 0 && result.acdoca.length > 0) {
          result.items = result.acdoca.map(r => ({
            AccountingDocumentItem: r.BUZEI || r.DOCLN, GLAccount: r.RACCT,
            DebitAmountInTransCrcy: r.DRCRK === 'S' ? r.TSL : '',
            CreditAmountInTransCrcy: r.DRCRK === 'H' ? r.TSL : '',
            TransactionCurrency: r.RHCUR, Customer: r.KUNNR, Supplier: r.LIFNR,
            ProfitCenter: r.PRCTR, CostCenter: r.KOSTL,
          }));
          result.header = result.header || {
            CompanyCode: result.acdoca[0].RBUKRS, AccountingDocument: objectId,
            FiscalYear: result.acdoca[0].GJAHR,
          };
          result.service = 'RFC (ACDOCA)';
        }

        if (result.items.length === 0) throw new Error('Document not found in BKPF/BSEG or ACDOCA');
        console.log(`[ProofForge] Success: ${result.items.length} line items`);
        setSapDocs((prev) => ({ ...prev, [key]: result }));
        await saveSapPayload(objectType, objectId, result);
        return;
      } catch (rfcErr) {
        console.error('[ProofForge] SOAP RFC also failed:', rfcErr.message);
        lastError = `OData: all 403. RFC: ${rfcErr.message}`;
      }

      setSapDocs((prev) => ({ ...prev, [key]: { error: lastError } }));
    } else {
      // On VPS: try server-side fetch
      console.log('[ProofForge] Remote mode — trying server-side SAP fetch');
      try {
        const res = await fetch('/api/sap/fetch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('pf_token')}`,
          },
          body: JSON.stringify({ sap_system: sys, object_type: objectType, object_id: objectId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        const result = { items: data.items, fiori_link: data.fiori_link, fetched_at: data.fetched_at };
        setSapDocs((prev) => ({ ...prev, [key]: result }));
        await saveSapPayload(objectType, objectId, result);
      } catch (err) {
        console.error('[ProofForge] Server fetch failed:', err.message);
        setSapDocs((prev) => ({ ...prev, [key]: { error: `${err.message}. Open ProofForge via http://localhost:8585 with local proxy running.` } }));
      }
    }
  };

  // Save fetched SAP data permanently to the attempt
  const saveSapPayload = async (objectType, objectId, fetchedData) => {
    const stepExec = getStepExec(activeStep);
    const attempt = getLatestAttempt(stepExec);
    if (!attempt) return;
    const payloads = { ...(attempt.sap_payloads || {}) };
    payloads[`${objectType}_${objectId}`] = {
      object_type: objectType,
      object_id: objectId,
      items: fetchedData.items,
      fiori_link: fetchedData.fiori_link,
      fetched_at: fetchedData.fetched_at,
    };
    await handleUpdateAttempt(activeStep, attempt.attempt_number, { sap_payloads: payloads });
  };

  const buildSapDocLink = (objectType, objectId) => {
    const sys = run.sap_system;
    if (!sys?.base_url) return null;
    const client = sys.client || '000';
    const lang = sys.language || 'EN';
    if (objectType === 'FI Document') {
      return `${sys.base_url}/sap/bc/ui2/flp?sap-client=${client}&sap-language=${lang}#FinancialAccounting-displayJournalEntry?AccountingDocument=${objectId}`;
    }
    return null;
  };

  // RFC_READ_TABLE via SOAP — works on virtually any SAP system
  const fetchViaSoapRfc = async (table, fields, where, sapBase, sapClient, auth) => {
    const fieldsXml = fields.map(f => `<item><FIELDNAME>${f}</FIELDNAME></item>`).join('');
    const whereXml = where.map(w => `<item><TEXT>${w}</TEXT></item>`).join('');
    const soap = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:rfc="urn:sap-com:document:sap:rfc:functions">
<soap:Body><rfc:RFC_READ_TABLE>
<QUERY_TABLE>${table}</QUERY_TABLE><DELIMITER>|</DELIMITER>
<NO_DATA></NO_DATA>
<ROWSKIPS>0</ROWSKIPS>
<ROWCOUNT>0</ROWCOUNT>
<OPTIONS>${whereXml}</OPTIONS>
<FIELDS>${fieldsXml}</FIELDS>
<DATA></DATA>
</rfc:RFC_READ_TABLE></soap:Body></soap:Envelope>`;

    const res = await fetch(`/sap/bc/soap/rfc?sap-client=${sapClient}`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'urn:sap-com:document:sap:rfc:functions:RFC_READ_TABLE',
        'X-SAP-Target': sapBase,
      },
      body: soap,
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`SOAP ${res.status}: ${t.slice(0, 200)}`);
    }
    const xml = await res.text();
    console.log('[ProofForge] SOAP response length:', xml.length);
    console.log('[ProofForge] SOAP XML:', xml.length < 5000 ? xml : xml.slice(0, 3000) + '\n...(truncated)');
    // Parse response: extract FIELDS and DATA
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const faultNode = doc.querySelector('faultstring');
    if (faultNode) throw new Error(`SAP RFC error: ${faultNode.textContent}`);

    // Parse — robust for all SAP versions
    // Collect FIELDNAME from any parent (FIELDS, ET_FIELDINFO, etc.)
    // Collect WA (data rows) from any parent (DATA, ET_DATA, TBLOUT, etc.)
    const allElements = doc.getElementsByTagName('*');
    const fieldNames = [];
    const dataWa = [];
    for (const el of allElements) {
      const ln = el.localName || el.nodeName;
      if (ln === 'FIELDNAME') fieldNames.push(el.textContent);
      // WA can appear in DATA, ET_DATA, TBLOUT — just grab all WA tags
      if (ln === 'WA') dataWa.push(el.textContent);
      // Some versions use LINE instead of WA
      if (ln === 'LINE') dataWa.push(el.textContent);
    }

    // Fallback: if no WA/LINE found, search for any text containing the delimiter
    if (dataWa.length === 0 && fieldNames.length > 0) {
      for (const el of allElements) {
        const txt = el.textContent;
        if (el.children.length === 0 && txt.includes('|') && txt.split('|').length >= fieldNames.length / 2) {
          dataWa.push(txt);
        }
      }
    }

    console.log('[ProofForge] Fields:', fieldNames.length, fieldNames);
    console.log('[ProofForge] Data rows:', dataWa.length);
    if (dataWa.length > 0) console.log('[ProofForge] First row:', dataWa[0]);
    if (dataWa.length === 0 && fieldNames.length > 0) {
      console.log('[ProofForge] Fields found but no data — document may not exist in this company code/year');
    }

    return dataWa.map(wa => {
      const vals = wa.split('|');
      const row = {};
      fieldNames.forEach((f, i) => { row[f] = (vals[i] || '').trim(); });
      return row;
    });
  };

  // FB03-style header fields — two rows
  const DOC_HEADER_ROW1 = [
    { key: 'CompanyCode', label: 'Company Code' },
    { key: 'AccountingDocumentType', label: 'Doc Type' },
    { key: 'PostingDate', label: 'Posting Date', isDate: true },
    { key: 'DocumentDate', label: 'Document Date', isDate: true },
    { key: 'TransactionCurrency', label: 'Currency' },
    { key: 'FiscalYear', label: 'Fiscal Year' },
    { key: 'Period', label: 'Period' },
  ];
  const DOC_HEADER_ROW2 = [
    { key: 'DocumentHeaderText', label: 'Header Text' },
    { key: 'Reference', label: 'Reference' },
    { key: 'CreatedBy', label: 'Created By' },
    { key: 'CreatedOn', label: 'Created On', isDate: true },
    { key: 'TransactionCode', label: 'TCode' },
    { key: 'ExchangeRate', label: 'Exch. Rate' },
    { key: 'ReversalDocument', label: 'Reversal Doc' },
  ];

  // Line item columns
  const LINE_ITEM_FIELDS = [
    { key: 'AccountingDocumentItem', label: 'Itm' },
    { key: 'PostingKey', label: 'PK' },
    { key: 'AccountType', label: 'Tp' },
    { key: 'GLAccount', label: 'G/L Account' },
    { key: 'Customer', label: 'Customer' },
    { key: 'Supplier', label: 'Supplier' },
    { key: 'DebitAmountInTransCrcy', label: 'Debit', align: 'right', isAmount: true },
    { key: 'CreditAmountInTransCrcy', label: 'Credit', align: 'right', isAmount: true },
    { key: 'TaxCode', label: 'Tax' },
    { key: 'ProfitCenter', label: 'Profit Ctr' },
    { key: 'CostCenter', label: 'Cost Ctr' },
    { key: 'BusinessArea', label: 'BusArea' },
    { key: 'AssignmentReference', label: 'Assignment' },
    { key: 'ItemText', label: 'Text' },
    { key: 'PaymentTerms', label: 'PmtTerms' },
    { key: 'BaselineDate', label: 'Baseline', isDate: true },
  ];

  // ACDOCA columns
  const ACDOCA_FIELDS = [
    { key: 'RLDNR', label: 'Ledger' },
    { key: 'DOCLN', label: 'Line' },
    { key: 'RACCT', label: 'Account' },
    { key: 'DRCRK', label: 'D/C' },
    { key: 'TSL', label: 'Trans. Amt', align: 'right', isAmount: true },
    { key: 'HSL', label: 'Local Amt', align: 'right', isAmount: true },
    { key: 'RHCUR', label: 'Curr' },
    { key: 'KUNNR', label: 'Customer' },
    { key: 'LIFNR', label: 'Supplier' },
    { key: 'PRCTR', label: 'Profit Ctr' },
    { key: 'KOSTL', label: 'Cost Ctr' },
    { key: 'SEGMENT', label: 'Segment' },
    { key: 'RFAREA', label: 'Func. Area' },
  ];

  // Format SAP date YYYYMMDD → DD.MM.YYYY
  const fmtDate = (d) => d && d.length === 8 ? `${d.slice(6,8)}.${d.slice(4,6)}.${d.slice(0,4)}` : d || '';
  // Format amount with thousands separator
  const fmtAmt = (v) => { if (!v || v === '0' || v === '0.00') return ''; const n = parseFloat(v); return isNaN(n) ? v : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

  const [expandedAcdoca, setExpandedAcdoca] = useState({});

  const renderHeaderGrid = (hdr, fields) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1px 12px', padding: '6px 12px', background: '#f8fafc' }}>
      {fields.map(f => {
        let val = hdr?.[f.key] || '';
        if (f.isDate) val = fmtDate(val);
        if (!val || val === '0' || val === '000') return null;
        return (
          <div key={f.key} style={{ display: 'flex', gap: '4px', padding: '1px 0', fontSize: '11px' }}>
            <span style={{ color: '#6b7280', minWidth: '90px' }}>{f.label}:</span>
            <span style={{ fontWeight: 600 }}>{val}</span>
          </div>
        );
      })}
    </div>
  );

  const renderTable = (items, fields) => {
    const visibleFields = fields.filter(f => items.some(it => it[f.key]));
    let totalDebit = 0, totalCredit = 0;
    items.forEach(it => {
      totalDebit += parseFloat(it.DebitAmountInTransCrcy || 0);
      totalCredit += parseFloat(it.CreditAmountInTransCrcy || 0);
    });
    return (
      <div style={{ overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead>
            <tr style={{ background: '#edf2f7' }}>
              {visibleFields.map(f => (
                <th key={f.key} style={{ padding: '4px 6px', textAlign: f.align || 'left', fontWeight: 600, color: '#4a5568', whiteSpace: 'nowrap', borderBottom: '2px solid #cbd5e0', fontSize: '10px', textTransform: 'uppercase' }}>{f.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid #eef0f3', background: idx % 2 === 0 ? '#fff' : '#fafbfc' }}>
                {visibleFields.map(f => (
                  <td key={f.key} style={{ padding: '3px 6px', whiteSpace: 'nowrap', textAlign: f.align || 'left', fontFamily: f.isAmount ? 'monospace' : 'inherit' }}>
                    {f.isAmount ? fmtAmt(item[f.key]) : f.isDate ? fmtDate(item[f.key]) : item[f.key] || ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {(totalDebit > 0 || totalCredit > 0) && (
            <tfoot>
              <tr style={{ background: '#edf2f7', fontWeight: 700 }}>
                {visibleFields.map(f => (
                  <td key={f.key} style={{ padding: '4px 6px', textAlign: f.align || 'left', borderTop: '2px solid #cbd5e0', fontFamily: f.isAmount ? 'monospace' : 'inherit' }}>
                    {f.key === 'DebitAmountInTransCrcy' ? fmtAmt(totalDebit) : ''}
                    {f.key === 'CreditAmountInTransCrcy' ? fmtAmt(totalCredit) : ''}
                    {f.key === 'AccountingDocumentItem' || f.key === 'DOCLN' ? `${items.length}` : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    );
  };

  const renderDocumentFB03 = (docData, objectType) => {
    if (!docData?.items || docData.items.length === 0) {
      return <div style={{ padding: '10px', color: '#6b7280', fontSize: '12px' }}>No data returned from SAP</div>;
    }
    const hdr = docData.header || docData.items[0];
    const docKey = `${objectType}_${hdr?.AccountingDocument || ''}`;

    return (
      <div style={{ fontSize: '12px' }}>
        {/* Cash Journal Header (if Cash Document) */}
        {docData.cashJournal && (
          <div style={{ padding: '6px 12px', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0' }}>
            <div style={{ fontWeight: 600, fontSize: '11px', color: '#166534', marginBottom: '2px' }}>Cash Journal</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1px 12px', fontSize: '11px' }}>
              {[
                { label: 'Cash Journal', val: docData.cashJournal.CashJournal },
                { label: 'Business Trans.', val: docData.cashJournal.BusinessTransaction },
                { label: 'Amount', val: fmtAmt(docData.cashJournal.Amount) },
                { label: 'Currency', val: docData.cashJournal.Currency },
                { label: 'Tax Amount', val: fmtAmt(docData.cashJournal.TaxAmount) },
                { label: 'Bank Account', val: docData.cashJournal.BankAccount },
                { label: 'Status', val: docData.cashJournal.PostingStatus },
                { label: 'Date', val: fmtDate(docData.cashJournal.DocumentDate) },
                { label: 'Created By', val: docData.cashJournal.CreatedBy },
              ].filter(f => f.val && f.val !== '0.00').map(f => (
                <div key={f.label} style={{ display: 'flex', gap: '4px' }}>
                  <span style={{ color: '#4ade80', minWidth: '90px' }}>{f.label}:</span>
                  <span style={{ fontWeight: 600, color: '#166534' }}>{f.val}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Document Header — FB03 style */}
        {renderHeaderGrid(hdr, DOC_HEADER_ROW1)}
        {renderHeaderGrid(hdr, DOC_HEADER_ROW2)}
        <div style={{ borderBottom: '1px solid #e2e5e9' }} />

        {/* Line Items */}
        {renderTable(docData.items, LINE_ITEM_FIELDS)}

        {/* ACDOCA Registers — collapsible */}
        {docData.acdoca?.length > 0 && (
          <div style={{ borderTop: '1px solid #e2e5e9' }}>
            <button
              onClick={() => setExpandedAcdoca(prev => ({ ...prev, [docKey]: !prev[docKey] }))}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 600, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}
            >
              <span>{expandedAcdoca[docKey] ? '▾' : '▸'}</span>
              <span>ACDOCA Universal Journal ({docData.acdoca.length} entries)</span>
            </button>
            {expandedAcdoca[docKey] && renderTable(docData.acdoca, ACDOCA_FIELDS)}
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: '4px 12px', fontSize: '10px', color: '#9ca3af', borderTop: '1px solid #eef0f3', display: 'flex', gap: '12px' }}>
          <span>Fetched {new Date(docData.fetched_at).toLocaleString()}</span>
          {docData.service && <span>via {docData.service}</span>}
        </div>
      </div>
    );
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const url = URL.createObjectURL(file);
          setPastedImages((prev) => [...prev, { file, url }]);
        }
        break;
      }
    }
  };

  const handleUploadPasted = async (stepId) => {
    const stepExec = getStepExec(stepId);
    const attempt = getLatestAttempt(stepExec);
    if (!attempt) return;
    const allAttachments = [...(attempt.attachments || [])];
    for (const img of pastedImages) {
      const meta = await api.upload(`/attachments/${id}/${stepId}/${attempt.attempt_number}`, img.file, `screenshot_${Date.now()}.png`);
      allAttachments.push(meta);
    }
    await handleUpdateAttempt(stepId, attempt.attempt_number, { attachments: allAttachments });
    setPastedImages([]);
  };

  const removePastedImage = (index) => {
    setPastedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDeleteAttempt = async (stepId, attemptNum) => {
    if (!confirm(`Delete attempt #${attemptNum}?`)) return;
    const stepExec = getStepExec(stepId);
    const remaining = stepExec.attempts.filter((a) => a.attempt_number !== attemptNum);
    const updatedStepExecs = run.step_executions.map((se) => {
      if (se.step_id !== stepId) return se;
      return {
        ...se,
        attempts: remaining,
        current_status: remaining.length > 0 ? remaining[remaining.length - 1].status : 'not_started',
      };
    });
    await api.put(`/runs/${id}`, { step_executions: updatedStepExecs });
    load();
  };

  const handleAddSapObject = async (stepId) => {
    if (!sapDocNum.trim()) return;
    const stepExec = getStepExec(stepId);
    const attempt = getLatestAttempt(stepExec);
    if (!attempt) return;
    const existing = attempt.sap_objects || [];
    const newObj = {
      source_system: 'SAP',
      object_type: sapDocType,
      object_id: sapDocNum.trim(),
      captured_at: new Date().toISOString(),
    };
    await handleUpdateAttempt(stepId, attempt.attempt_number, { sap_objects: [...existing, newObj] });
    setSapDocNum('');
  };

  const handleUpdateAttempt = async (stepId, attemptNum, data) => {
    await api.put(`/runs/${id}/steps/${stepId}/attempts/${attemptNum}`, data);
    load();
  };

  const handleAddValidation = async (stepId, attemptNum) => {
    if (!valName.trim()) return;
    await api.post(`/runs/${id}/steps/${stepId}/attempts/${attemptNum}/validations`, {
      name: valName,
    });
    setValName('');
    load();
  };

  const handleUpdateValidation = async (stepId, attemptNum, valId, data) => {
    await api.put(`/runs/${id}/steps/${stepId}/attempts/${attemptNum}/validations/${valId}`, data);
    load();
  };

  const handleUpload = async (stepId) => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const stepExec = getStepExec(stepId);
    const attempt = getLatestAttempt(stepExec);
    if (!attempt) return;
    const meta = await api.upload(`/attachments/${id}/${stepId}/${attempt.attempt_number}`, file);
    if (attempt) {
      const attachments = [...(attempt.attachments || []), meta];
      await handleUpdateAttempt(stepId, attempt.attempt_number, { attachments });
    }
    fileRef.current.value = '';
    load();
  };

  const handleCreateDefect = async (stepId) => {
    const stepDef = getStepDef(stepId);
    const defect = await api.post('/defects', {
      title: `Defect in step: ${stepDef.name}`,
      run_id: run.id,
      scenario_id: run.scenario_id,
      plan_id: run.plan_id,
      step_id: stepId,
      source_type: 'Step Execution',
    });
    navigate(`/defects/${defect.id}`);
  };

  const handleRunStatus = async (status) => {
    await api.put(`/runs/${id}`, { status });
    load();
  };

  const handleUpdateSapSystem = async (field, value) => {
    const sapSystem = { ...(run.sap_system || {}), [field]: value };
    await api.put(`/runs/${id}`, { sap_system: sapSystem });
    load();
  };

  const buildSapUrl = (fioriApp) => {
    const sys = run.sap_system;
    if (!sys?.base_url || !fioriApp) return null;
    const client = sys.client || '000';
    const lang = sys.language || 'EN';
    return `${sys.base_url}/sap/bc/ui2/flp?sap-client=${client}&sap-language=${lang}#${fioriApp}`;
  };

  const buildFlpHomeUrl = () => {
    const sys = run.sap_system;
    if (!sys?.base_url) return null;
    const client = sys.client || '000';
    const lang = sys.language || 'EN';
    return `${sys.base_url}/sap/bc/ui2/flp?sap-client=${client}&sap-language=${lang}#Shell-home`;
  };

  const activeStepDef = getStepDef(activeStep);
  const activeStepExec = getStepExec(activeStep);
  const activeAttempt = getLatestAttempt(activeStepExec);

  return (
    <div className="page run-page">
      <div className="page-header">
        <div className="breadcrumb">
          <a onClick={() => navigate('/runs')}>Runs</a>
          <span>/</span>
          <span>#{run.id}</span>
          <span className="breadcrumb-sep">—</span>
          <span>{snapshot?.name}</span>
        </div>
        <div className="page-actions">
          <StatusBadge status={run.status} />
          <select
            value={run.status}
            onChange={(e) => handleRunStatus(e.target.value)}
            className="status-select"
          >
            {RUN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {run.result && <span className="result-tag">Result: <StatusBadge status={run.result} /></span>}
        </div>
      </div>

      {/* SAP System Selector */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '10px 16px', background: '#f0f4ff', border: '1px solid #d0d9f0', borderRadius: '6px', marginBottom: '12px', fontSize: '12px' }}>
        <span style={{ fontWeight: 600, color: '#4c6fff', whiteSpace: 'nowrap' }}>SAP System:</span>
        <select
          value={run.sap_system?.system_id || ''}
          onChange={async (e) => {
            const sysId = Number(e.target.value);
            if (!sysId) { await api.put(`/runs/${id}`, { sap_system: null }); load(); return; }
            const full = await api.get(`/systems/${sysId}/credentials`);
            await api.put(`/runs/${id}`, { sap_system: { system_id: sysId, ...full } });
            load();
          }}
          style={{ width: '250px', fontSize: '12px' }}
        >
          <option value="">— Select system —</option>
          {sapSystems.map((s) => (
            <option key={s.id} value={s.id}>{s.name} (Client {s.client})</option>
          ))}
        </select>
        {run.sap_system?.base_url && (
          <span style={{ fontSize: '11px', color: '#6b7280', fontFamily: 'monospace' }}>
            {run.sap_system.base_url} · Client {run.sap_system.client}
          </span>
        )}
        {buildFlpHomeUrl() && (
          <a href={buildFlpHomeUrl()} target="_blank" rel="noopener" className="btn btn-sm btn-primary" style={{ marginLeft: 'auto', textDecoration: 'none' }}>
            Open Fiori Launchpad
          </a>
        )}
      </div>

      <div className="run-layout">
        {/* Step list sidebar */}
        <div className="run-steps-panel">
          <h3>Steps</h3>
          {run.step_executions?.map((se) => {
            const def = getStepDef(se.step_id);
            return (
              <div
                key={se.step_id}
                className={`run-step-item ${activeStep === se.step_id ? 'active' : ''}`}
                onClick={() => setActiveStep(se.step_id)}
              >
                <span className="step-order">{def.order}</span>
                <span className="step-name-text">{def.name}</span>
                <StatusBadge status={se.current_status} />
              </div>
            );
          })}
        </div>

        {/* Step detail panel */}
        <div className="run-step-detail">
          {activeStepDef && (
            <>
              <div className="step-detail-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <h3 style={{ margin: 0 }}>Step {activeStepDef.order}: {activeStepDef.name}</h3>
                  {buildSapUrl(activeStepDef.fiori_app) && (
                    <a
                      href={buildSapUrl(activeStepDef.fiori_app)}
                      target="_blank"
                      rel="noopener"
                      className="btn btn-sm btn-primary"
                      style={{ textDecoration: 'none', fontSize: '11px' }}
                    >
                      ▶ Open in SAP
                    </a>
                  )}
                </div>
                <div className="step-detail-meta">
                  <span className={`executor-badge ${activeStepDef.executor_type}`}>{activeStepDef.executor_type}</span>
                  <span className="action-tag">{activeStepDef.action_type}</span>
                  {activeStepDef.mandatory !== false && <span className="mandatory-tag">Mandatory</span>}
                  {activeStepDef.fiori_app && <span className="action-tag" style={{ fontFamily: 'monospace', fontSize: '10px' }}>{activeStepDef.fiori_app}</span>}
                </div>
              </div>

              <div className="step-info-row" style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  {activeStepDef.description && (
                    <div className="step-info-block">
                      <label>Description</label>
                      <p style={{ whiteSpace: 'pre-line' }}>{activeStepDef.description}</p>
                    </div>
                  )}
                </div>
                {activeStepDef.parameters && Object.keys(activeStepDef.parameters).length > 0 && (
                  <div style={{ flex: 1 }}>
                    <div className="step-info-block">
                      <label>Input Parameters</label>
                      <div style={{ background: '#fafbfc', padding: '6px 10px', borderRadius: '4px', border: '1px solid #eef0f3', fontSize: '12px' }}>
                        {typeof activeStepDef.parameters === 'string'
                          ? <p style={{ whiteSpace: 'pre-line' }}>{activeStepDef.parameters}</p>
                          : Object.entries(activeStepDef.parameters).map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', gap: '8px', padding: '2px 0' }}>
                              <span style={{ fontWeight: 600, color: '#6b7280', minWidth: '140px' }}>{k}:</span>
                              <span>{v}</span>
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {activeStepDef.preconditions && (
                <div className="step-info-block">
                  <label>Preconditions</label>
                  <p>{activeStepDef.preconditions}</p>
                </div>
              )}
              {activeStepDef.expected_result && (
                <div className="step-info-block">
                  <label>Expected Result</label>
                  <p>{activeStepDef.expected_result}</p>
                </div>
              )}

              {/* Execution controls */}
              <div className="execution-section">
                <h4>Execution</h4>
                {activeStepExec?.attempts?.length > 0 && (
                  <div className="attempts-list">
                    {activeStepExec.attempts.map((att) => (
                      <div key={att.attempt_number} className="attempt-card">
                        <div className="attempt-header">
                          <span>Attempt #{att.attempt_number}</span>
                          <StatusBadge status={att.status} />
                          <span className="attempt-time">
                            {att.started_at && new Date(att.started_at).toLocaleString()}
                          </span>
                          <button
                            className="btn-icon"
                            onClick={() => handleDeleteAttempt(activeStep, att.attempt_number)}
                            title="Delete attempt"
                            style={{ marginLeft: 'auto', fontSize: '14px' }}
                          >×</button>
                        </div>
                        {att.comment && <p className="attempt-comment">{att.comment}</p>}

                        {/* SAP Objects */}
                        {att.sap_objects?.length > 0 && (
                          <div className="sap-objects">
                            <label>SAP Documents</label>
                            {att.sap_objects.map((obj, i) => {
                              const docKey = `${obj.object_type}_${obj.object_id}`;
                              const docData = sapDocs[docKey];
                              const docLink = buildSapDocLink(obj.object_type, obj.object_id);
                              return (
                                <div key={i} style={{ border: '1px solid #e2e5e9', borderRadius: '6px', marginBottom: '8px', overflow: 'hidden' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: '#fafbfc' }}>
                                    <span className="sap-type">{obj.object_type}</span>
                                    <span className="sap-id" style={{ fontWeight: 600 }}>{obj.object_id}</span>
                                    {docLink && (
                                      <a href={docLink} target="_blank" rel="noopener" style={{ fontSize: '11px', color: '#4c6fff', textDecoration: 'none' }}>
                                        Open in SAP ↗
                                      </a>
                                    )}
                                    <button
                                      className="btn btn-sm"
                                      style={{ marginLeft: 'auto', fontSize: '10px' }}
                                      onClick={() => fetchSapDocument(obj.object_type, obj.object_id)}
                                      disabled={docData?.loading}
                                    >
                                      {docData?.loading ? 'Loading...' : docData?.items ? '↻ Refresh' : '⬇ Fetch from SAP'}
                                    </button>
                                    <button
                                      className="btn-icon"
                                      style={{ fontSize: '12px', padding: '0 4px' }}
                                      title="Remove"
                                      onClick={() => {
                                        const updated = att.sap_objects.filter((_, idx) => idx !== i);
                                        handleUpdateAttempt(activeStep, att.attempt_number, { sap_objects: updated });
                                      }}
                                    >×</button>
                                  </div>
                                  {docData?.error && (
                                    <div style={{ padding: '8px 10px', color: '#c62828', fontSize: '11px', background: '#fce4ec' }}>
                                      {docData.error}
                                    </div>
                                  )}
                                  {docData?.items && (
                                    <div>
                                      {renderDocumentFB03(docData, obj.object_type)}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Attachments */}
                        {att.attachments?.length > 0 && (
                          <div className="attachments">
                            <label>Attachments</label>
                            {att.attachments.map((a, i) => (
                              <a key={i} href={`/api/attachments/${a.storage_path}`} target="_blank" className="attachment-link">
                                {a.filename}
                              </a>
                            ))}
                          </div>
                        )}

                        {/* Validations */}
                        {att.validations?.length > 0 && (
                          <div className="validations-section">
                            <label>Validations</label>
                            {att.validations.map((v) => (
                              <div key={v.id} className="validation-card">
                                <span className="val-name">{v.name}</span>
                                <select
                                  value={v.status}
                                  onChange={(e) => handleUpdateValidation(activeStep, att.attempt_number, v.id, { status: e.target.value })}
                                  className="val-status-select"
                                >
                                  {VAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <input
                                  placeholder="Comment..."
                                  defaultValue={v.comment}
                                  onBlur={(e) => handleUpdateValidation(activeStep, att.attempt_number, v.id, { comment: e.target.value })}
                                  className="val-comment"
                                />
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add validation */}
                        {att === activeAttempt && (
                          <div className="add-validation-row">
                            <input
                              placeholder="Validation name..."
                              value={valName}
                              onChange={(e) => setValName(e.target.value)}
                            />
                            <button className="btn btn-sm btn-ghost" onClick={() => handleAddValidation(activeStep, att.attempt_number)}>
                              + Validation
                            </button>
                          </div>
                        )}

                        {/* Update status of current attempt */}
                        {att === activeAttempt && att.status === 'in_progress' && (
                          <div className="step-status-actions">
                            {['passed', 'passed_with_comments', 'failed', 'blocked', 'skipped'].map((s) => (
                              <button
                                key={s}
                                className={`btn btn-sm status-btn status-${s}`}
                                onClick={() => handleUpdateAttempt(activeStep, att.attempt_number, { status: s, comment })}
                              >
                                {s.replace(/_/g, ' ')}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Start / Re-execute */}
                {(!activeAttempt || ['passed', 'passed_with_comments', 'failed', 'blocked', 'skipped'].includes(activeAttempt?.status)) && (
                  <div className="execute-controls">
                    <div
                      style={{ border: '2px dashed #d0d9f0', borderRadius: '6px', padding: '10px', marginBottom: '8px', background: pastedImages.length > 0 ? '#f8faff' : 'transparent' }}
                    >
                      <textarea
                        placeholder="Comment + paste screenshot (Ctrl+V)..."
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        onPaste={handlePaste}
                        rows={2}
                        className="comment-input"
                        style={{ marginBottom: pastedImages.length > 0 ? '8px' : 0 }}
                      />
                      {pastedImages.length > 0 && (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {pastedImages.map((img, i) => (
                            <div key={i} style={{ position: 'relative', border: '1px solid #e2e5e9', borderRadius: '4px', overflow: 'hidden' }}>
                              <img src={img.url} alt={`paste-${i}`} style={{ maxWidth: '200px', maxHeight: '120px', display: 'block' }} />
                              <button
                                onClick={() => removePastedImage(i)}
                                style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: '18px', height: '18px', fontSize: '11px', cursor: 'pointer', lineHeight: '16px', textAlign: 'center' }}
                              >×</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="execute-buttons">
                      <button className="btn btn-primary" onClick={async () => {
                        await handleExecute(activeStep, 'in_progress');
                        if (pastedImages.length > 0) { await handleUploadPasted(activeStep); }
                      }}>
                        {activeAttempt ? 'Re-execute' : 'Start'}
                      </button>
                      <button className="btn btn-ghost status-passed" onClick={async () => {
                        await handleExecute(activeStep, 'passed');
                        if (pastedImages.length > 0) { await handleUploadPasted(activeStep); }
                      }}>
                        Pass
                      </button>
                      <button className="btn btn-ghost status-failed" onClick={async () => {
                        await handleExecute(activeStep, 'failed');
                        if (pastedImages.length > 0) { await handleUploadPasted(activeStep); }
                      }}>
                        Fail
                      </button>
                      <button className="btn btn-ghost status-skipped" onClick={() => handleExecute(activeStep, 'skipped')}>
                        Skip
                      </button>
                    </div>
                  </div>
                )}

                {/* SAP Document Reference */}
                {activeAttempt && (
                  <div style={{ marginTop: '12px', padding: '10px 14px', border: '1px solid #e2e5e9', borderRadius: '6px', background: '#fafbfc' }}>
                    <label style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', color: '#6b7280', marginBottom: '6px', display: 'block' }}>
                      SAP Document Reference
                    </label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <select value={sapDocType} onChange={(e) => setSapDocType(e.target.value)} style={{ width: '160px', fontSize: '12px' }}>
                        <option value="FI Document">FI Document</option>
                        <option value="Cash Document">Cash Document</option>
                        <option value="Material Document">Material Document</option>
                        <option value="Sales Order">Sales Order</option>
                        <option value="Purchase Order">Purchase Order</option>
                        <option value="Delivery">Delivery</option>
                        <option value="Invoice">Invoice</option>
                        <option value="Payment">Payment</option>
                        <option value="Other">Other</option>
                      </select>
                      <input
                        placeholder="Document number..."
                        value={sapDocNum}
                        onChange={(e) => setSapDocNum(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddSapObject(activeStep)}
                        style={{ flex: 1, fontSize: '12px' }}
                      />
                      <button className="btn btn-sm" onClick={() => handleAddSapObject(activeStep)}>
                        + Add
                      </button>
                    </div>
                  </div>
                )}

                {/* Upload */}
                <div className="upload-section">
                  <input type="file" ref={fileRef} />
                  <button className="btn btn-sm btn-ghost" onClick={() => handleUpload(activeStep)}>Upload</button>
                </div>

                {/* Create defect */}
                <div className="defect-action">
                  <button className="btn btn-sm btn-danger-ghost" onClick={() => handleCreateDefect(activeStep)}>
                    Create Defect
                  </button>
                </div>
              </div>

              {/* Related defects */}
              {defects.filter((d) => d.step_id === activeStep).length > 0 && (
                <div className="related-defects">
                  <h4>Related Defects</h4>
                  {defects.filter((d) => d.step_id === activeStep).map((d) => (
                    <Link to={`/defects/${d.id}`} key={d.id} className="defect-link">
                      <span>#{d.id} {d.title}</span>
                      <StatusBadge status={d.status} />
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
