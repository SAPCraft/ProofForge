import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Format SAP date YYYYMMDD → DD.MM.YYYY
const fmtDate = (d) => d && d.length === 8 ? `${d.slice(6,8)}.${d.slice(4,6)}.${d.slice(0,4)}` : d || '';
const fmtAmt = (v) => { if (!v || v === '0' || v === '0.00') return ''; const n = parseFloat(v); return isNaN(n) ? v : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
const stripZeros = (v) => { if (!v) return ''; return /^\d+$/.test(v) ? v.replace(/^0+/, '') || '0' : v; };
const statusLabel = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const COLORS = {
  passed: [46, 125, 50],
  passed_with_comments: [245, 158, 11],
  failed: [220, 53, 69],
  blocked: [156, 163, 175],
  skipped: [156, 163, 175],
  in_progress: [76, 111, 255],
  not_started: [200, 200, 200],
  pending: [200, 200, 200],
  waived: [156, 163, 175],
};

export default function generateRunPdf(run, sapDocs) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;
  let y = margin;

  const snapshot = run.scenario_snapshot || {};
  const steps = snapshot.steps || [];

  // --- Helpers ---
  const addPage = () => { doc.addPage(); y = margin; };
  const checkPage = (need = 30) => { if (y + need > pageH - 15) addPage(); };

  const drawText = (text, x, yy, opts = {}) => {
    doc.setFont('helvetica', opts.style || 'normal');
    doc.setFontSize(opts.size || 10);
    doc.setTextColor(...(opts.color || [51, 51, 51]));
    doc.text(text, x, yy, opts.textOpts);
    return doc.getTextDimensions(text).h;
  };

  const drawWrapped = (text, x, yy, maxW, opts = {}) => {
    doc.setFont('helvetica', opts.style || 'normal');
    doc.setFontSize(opts.size || 9);
    doc.setTextColor(...(opts.color || [51, 51, 51]));
    const lines = doc.splitTextToSize(text || '', maxW);
    for (const line of lines) {
      checkPage(5);
      doc.text(line, x, yy);
      yy += (opts.size || 9) * 0.45;
    }
    return yy;
  };

  const drawStatusBadge = (status, x, yy) => {
    const color = COLORS[status] || [156, 163, 175];
    const label = statusLabel(status);
    doc.setFontSize(7);
    const tw = doc.getTextWidth(label) + 4;
    doc.setFillColor(...color);
    doc.roundedRect(x, yy - 3, tw, 4.5, 1, 1, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text(label, x + 2, yy);
    doc.setTextColor(51, 51, 51);
    return tw;
  };

  const drawSectionTitle = (title, yy) => {
    checkPage(12);
    doc.setFillColor(76, 111, 255);
    doc.rect(margin, yy, contentW, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(title, margin + 3, yy + 5);
    doc.setTextColor(51, 51, 51);
    return yy + 10;
  };

  const drawSubTitle = (title, yy) => {
    checkPage(8);
    doc.setFillColor(240, 244, 255);
    doc.rect(margin, yy, contentW, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(76, 111, 255);
    doc.text(title, margin + 2, yy + 4.2);
    doc.setTextColor(51, 51, 51);
    return yy + 8;
  };

  const drawKeyValue = (key, value, x, yy, keyW = 35) => {
    if (!value) return yy;
    checkPage(5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text(key + ':', x, yy);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 51, 51);
    doc.text(String(value), x + keyW, yy);
    return yy + 4;
  };

  // --- Title page header ---
  doc.setFillColor(76, 111, 255);
  doc.rect(0, 0, pageW, 40, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text('Test Run Report', margin, 18);

  doc.setFontSize(11);
  doc.text(snapshot.name || 'Unnamed Scenario', margin, 27);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Run #${run.id} | ${new Date(run.created_at || Date.now()).toLocaleDateString()}`, margin, 34);

  y = 48;

  // --- Run info block ---
  doc.setFillColor(250, 251, 252);
  doc.rect(margin, y, contentW, 26, 'F');
  doc.setDrawColor(226, 229, 233);
  doc.rect(margin, y, contentW, 26, 'S');

  let infoY = y + 5;
  const col1 = margin + 3;
  const col2 = margin + contentW / 2;

  infoY = drawKeyValue('Status', statusLabel(run.status), col1, infoY, 22);
  infoY = drawKeyValue('Result', run.result ? statusLabel(run.result) : '-', col1, infoY, 22);
  infoY = drawKeyValue('Executed by', run.executed_by || '-', col1, infoY, 22);

  let infoY2 = y + 5;
  if (run.sap_system?.name) {
    infoY2 = drawKeyValue('SAP System', run.sap_system.name, col2, infoY2, 25);
    infoY2 = drawKeyValue('Client', run.sap_system.client || '-', col2, infoY2, 25);
    infoY2 = drawKeyValue('Base URL', run.sap_system.base_url || '-', col2, infoY2, 25);
  }

  y = Math.max(infoY, infoY2) + 6;

  // --- Steps summary table ---
  y = drawSectionTitle('Steps Summary', y);

  const summaryRows = (run.step_executions || []).map(se => {
    const def = steps.find(s => s.id === se.step_id) || {};
    return [
      String(def.order || ''),
      def.name || '',
      statusLabel(se.current_status),
      (se.attempts || []).length.toString(),
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['#', 'Step Name', 'Status', 'Attempts']],
    body: summaryRows,
    theme: 'grid',
    headStyles: { fillColor: [76, 111, 255], fontSize: 8, font: 'helvetica', fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, font: 'helvetica' },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      2: { cellWidth: 28 },
      3: { cellWidth: 18, halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 2) {
        const status = (run.step_executions[data.row.index]?.current_status) || '';
        const color = COLORS[status];
        if (color) data.cell.styles.textColor = color;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });
  y = doc.lastAutoTable.finalY + 8;

  // --- Detailed steps ---
  for (const se of (run.step_executions || [])) {
    const def = steps.find(s => s.id === se.step_id) || {};

    checkPage(40);
    y = drawSectionTitle(`Step ${def.order}: ${def.name || 'Unnamed'}`, y);

    // Step meta
    const badgeW = drawStatusBadge(se.current_status, margin, y + 3);
    if (def.executor_type) {
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(107, 114, 128);
      doc.text(`[${def.executor_type}]  ${def.action_type || ''}`, margin + badgeW + 4, y + 3);
    }
    y += 8;

    // Description
    if (def.description) {
      checkPage(10);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text('Description:', margin, y);
      y += 4;
      y = drawWrapped(def.description, margin + 2, y, contentW - 4, { size: 8.5 });
      y += 2;
    }

    // Input parameters
    if (def.parameters && Object.keys(def.parameters).length > 0) {
      checkPage(10);
      y = drawSubTitle('Input Parameters', y);
      if (typeof def.parameters === 'string') {
        y = drawWrapped(def.parameters, margin + 2, y, contentW - 4, { size: 8.5 });
        y += 2;
      } else {
        for (const [k, v] of Object.entries(def.parameters)) {
          y = drawKeyValue(k, String(v), margin + 2, y, 45);
        }
        y += 2;
      }
    }

    // Expected result
    if (def.expected_result) {
      checkPage(10);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text('Expected Result:', margin, y);
      y += 4;
      y = drawWrapped(def.expected_result, margin + 2, y, contentW - 4, { size: 8.5 });
      y += 2;
    }

    // Attempts
    for (const att of (se.attempts || [])) {
      checkPage(15);
      y = drawSubTitle(`Attempt #${att.attempt_number}  —  ${statusLabel(att.status)}`, y);

      if (att.started_at) {
        y = drawKeyValue('Started', new Date(att.started_at).toLocaleString(), margin + 2, y, 20);
      }
      if (att.comment) {
        checkPage(8);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8.5);
        doc.setTextColor(75, 85, 99);
        y = drawWrapped(att.comment, margin + 2, y, contentW - 4, { style: 'italic', size: 8.5, color: [75, 85, 99] });
        y += 2;
      }

      // SAP Documents
      if (att.sap_objects?.length > 0) {
        for (const obj of att.sap_objects) {
          checkPage(12);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(76, 111, 255);
          doc.text(`SAP ${obj.object_type}: ${obj.object_id}`, margin + 2, y);
          y += 4;

          // Try to find fetched data
          const docKey = `${obj.object_type}_${obj.object_id}`;
          const docData = sapDocs[docKey] || att.sap_payloads?.[docKey];

          if (docData && !docData.error && !docData.loading) {
            // Cash Journal header
            if (docData.cashJournal) {
              checkPage(20);
              doc.setFillColor(240, 253, 244);
              const cashFields = [
                ['Cash Journal', stripZeros(docData.cashJournal.CashJournal)],
                ['Posting Number', stripZeros(docData.cashJournal.PostingNumber)],
                ['BP Name', docData.cashJournal.BPName],
                ['Receipts', fmtAmt(docData.cashJournal.Receipts)],
                ['Payments', fmtAmt(docData.cashJournal.Payments)],
                ['Net Amount', fmtAmt(docData.cashJournal.NetAmount)],
                ['Currency', docData.cashJournal.Currency],
                ['Posting Date', fmtDate(docData.cashJournal.PostingDate)],
                ['FI Document', stripZeros(docData.cashJournal.FIDocument)],
                ['Status', docData.cashJournal.Status === 'P' ? 'Posted' : docData.cashJournal.Status],
                ['Accountant', docData.cashJournal.Accountant],
                ['Text', docData.cashJournal.Text],
              ].filter(([, v]) => v && v !== '0' && v !== '0.00');

              const cashRows = [];
              for (let i = 0; i < cashFields.length; i += 3) {
                cashRows.push(cashFields.slice(i, i + 3));
              }
              for (const row of cashRows) {
                checkPage(5);
                let cx = margin + 2;
                for (const [label, val] of row) {
                  doc.setFont('helvetica', 'normal');
                  doc.setFontSize(7.5);
                  doc.setTextColor(22, 101, 52);
                  doc.text(`${label}: `, cx, y);
                  const lw = doc.getTextWidth(`${label}: `);
                  doc.setFont('helvetica', 'bold');
                  doc.text(val, cx + lw, y);
                  cx += 60;
                }
                y += 3.5;
              }
              y += 2;
            }

            // Document header
            if (docData.header) {
              const hdrFields = [
                ['Company Code', stripZeros(docData.header.CompanyCode)],
                ['Doc Type', docData.header.AccountingDocumentType],
                ['Posting Date', fmtDate(docData.header.PostingDate)],
                ['Document Date', fmtDate(docData.header.DocumentDate)],
                ['Currency', docData.header.TransactionCurrency],
                ['Fiscal Year', docData.header.FiscalYear],
                ['Period', docData.header.Period],
                ['Header Text', docData.header.DocumentHeaderText],
                ['Reference', docData.header.Reference],
                ['Origin Type', docData.header.ObjectType],
                ['Origin Key', docData.header.ObjectKey],
                ['Created By', docData.header.CreatedBy],
                ['TCode', docData.header.TransactionCode],
              ].filter(([, v]) => v && v !== '0' && v !== '000');

              if (hdrFields.length > 0) {
                checkPage(12);
                doc.setFillColor(248, 250, 252);
                const hdrRows = [];
                for (let i = 0; i < hdrFields.length; i += 3) {
                  hdrRows.push(hdrFields.slice(i, i + 3));
                }
                for (const row of hdrRows) {
                  checkPage(5);
                  let cx = margin + 2;
                  for (const [label, val] of row) {
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(7.5);
                    doc.setTextColor(107, 114, 128);
                    doc.text(`${label}: `, cx, y);
                    const lw = doc.getTextWidth(`${label}: `);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(51, 51, 51);
                    doc.text(val, cx + lw, y);
                    cx += 60;
                  }
                  y += 3.5;
                }
                y += 2;
              }
            }

            // Line items table
            if (docData.items?.length > 0) {
              checkPage(15);
              const isCash = obj.object_type === 'Cash Document';
              let head, body;

              if (isCash) {
                head = [['Itm', 'G/L Account', 'Amount TC', 'Amount LC', 'Curr', 'Customer', 'Tax', 'Text']];
                body = docData.items.map(it => [
                  stripZeros(it.AccountingDocumentItem),
                  stripZeros(it.GLAccount),
                  fmtAmt(it.AmountInTransactionCurrency),
                  fmtAmt(it.AmountInCompanyCodeCurrency),
                  it.TransactionCurrency || '',
                  stripZeros(it.Customer),
                  it.TaxCode || '',
                  it.ItemText || '',
                ]);
              } else {
                head = [['Itm', 'PK', 'G/L Account', 'Debit', 'Credit', 'Tax', 'Profit Ctr', 'Cost Ctr', 'Text']];
                body = docData.items.map(it => [
                  stripZeros(it.AccountingDocumentItem),
                  it.PostingKey || '',
                  stripZeros(it.GLAccount),
                  fmtAmt(it.DebitAmountInTransCrcy),
                  fmtAmt(it.CreditAmountInTransCrcy),
                  it.TaxCode || '',
                  stripZeros(it.ProfitCenter),
                  stripZeros(it.CostCenter),
                  it.ItemText || '',
                ]);
              }

              autoTable(doc, {
                startY: y,
                margin: { left: margin + 2, right: margin + 2 },
                head,
                body,
                theme: 'grid',
                headStyles: { fillColor: [237, 242, 247], textColor: [74, 85, 104], fontSize: 7, font: 'helvetica', fontStyle: 'bold' },
                bodyStyles: { fontSize: 7, font: 'helvetica' },
                styles: { cellPadding: 1.2 },
              });
              y = doc.lastAutoTable.finalY + 4;
            }

            // ACDOCA
            if (docData.acdoca?.length > 0) {
              checkPage(12);
              doc.setFont('helvetica', 'italic');
              doc.setFontSize(7.5);
              doc.setTextColor(107, 114, 128);
              doc.text(`ACDOCA Universal Journal (${docData.acdoca.length} entries)`, margin + 2, y);
              y += 4;

              autoTable(doc, {
                startY: y,
                margin: { left: margin + 2, right: margin + 2 },
                head: [['Ledger', 'Line', 'Account', 'D/C', 'Trans Amt', 'Local Amt', 'Curr']],
                body: docData.acdoca.map(r => [
                  r.RLDNR, r.DOCLN || r.BUZEI, stripZeros(r.RACCT), r.DRCRK,
                  fmtAmt(r.TSL), fmtAmt(r.HSL), r.RHCUR,
                ]),
                theme: 'grid',
                headStyles: { fillColor: [237, 242, 247], textColor: [74, 85, 104], fontSize: 6.5, font: 'helvetica', fontStyle: 'bold' },
                bodyStyles: { fontSize: 6.5, font: 'helvetica' },
                styles: { cellPadding: 1 },
              });
              y = doc.lastAutoTable.finalY + 4;
            }
          }
        }
      }

      // Validations
      if (att.validations?.length > 0) {
        checkPage(10);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(107, 114, 128);
        doc.text('Validations:', margin + 2, y);
        y += 4;

        autoTable(doc, {
          startY: y,
          margin: { left: margin + 2, right: margin + 2 },
          head: [['Validation', 'Status', 'Comment']],
          body: att.validations.map(v => [v.name, statusLabel(v.status), v.comment || '']),
          theme: 'grid',
          headStyles: { fillColor: [237, 242, 247], textColor: [74, 85, 104], fontSize: 7.5, font: 'helvetica', fontStyle: 'bold' },
          bodyStyles: { fontSize: 7.5, font: 'helvetica' },
          styles: { cellPadding: 1.5 },
          didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 1) {
              const st = att.validations[data.row.index]?.status || '';
              const color = COLORS[st];
              if (color) data.cell.styles.textColor = color;
              data.cell.styles.fontStyle = 'bold';
            }
          },
        });
        y = doc.lastAutoTable.finalY + 4;
      }

      // Attachments list
      if (att.attachments?.length > 0) {
        checkPage(8);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(107, 114, 128);
        doc.text('Attachments:', margin + 2, y);
        y += 4;
        for (const a of att.attachments) {
          checkPage(4);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(76, 111, 255);
          doc.text(`  ${a.filename}`, margin + 2, y);
          y += 3.5;
        }
        y += 2;
      }
    }

    y += 4;
  }

  // --- Footer on every page ---
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(156, 163, 175);
    doc.text(`ProofForge — Test Run #${run.id} — ${snapshot.name || ''}`, margin, pageH - 6);
    doc.text(`Page ${i} / ${totalPages}`, pageW - margin, pageH - 6, { align: 'right' });
  }

  // Save
  const filename = `TestRun_${run.id}_${(snapshot.name || 'report').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
  doc.save(filename);
}
