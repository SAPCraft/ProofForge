import { Router } from 'express';
import https from 'https';
import http from 'http';

const router = Router();

// Reusable SAP OData fetch
async function sapFetch(baseUrl, path, client, user, password) {
  const separator = path.includes('?') ? '&' : '?';
  const url = `${baseUrl}${path}${separator}sap-client=${client}&$format=json`;

  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const auth = Buffer.from(`${user}:${password}`).toString('base64');

    const req = mod.get(url, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      },
      rejectUnauthorized: false, // SAP self-signed certs
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`SAP returned ${res.statusCode}: ${body.slice(0, 500)}`));
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error(`Invalid JSON from SAP: ${body.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('SAP request timeout')); });
  });
}

// OData paths for different document types
const DOC_TEMPLATES = {
  'FI Document': {
    path: (docNum, companyCode, fiscalYear) =>
      `/sap/opu/odata/sap/API_OPLACCTGDOCITEMCUBE_SRV/A_OperationalAcctgDocItemCube?$filter=AccountingDocument eq '${docNum}'${companyCode ? ` and CompanyCode eq '${companyCode}'` : ''}${fiscalYear ? ` and FiscalYear eq '${fiscalYear}'` : ''}&$top=50`,
    fiori_link: (docNum) => `FinancialAccounting-displayJournalEntry?AccountingDocument=${docNum}`,
  },
  'Cash Document': {
    path: (docNum) =>
      `/sap/opu/odata/sap/API_OPLACCTGDOCITEMCUBE_SRV/A_OperationalAcctgDocItemCube?$filter=AccountingDocument eq '${docNum}'&$top=50`,
    fiori_link: (docNum) => `CashJournal-enterCashJournalEntry`,
  },
};

// Fetch SAP document
router.post('/fetch', async (req, res) => {
  const { sap_system, object_type, object_id, company_code, fiscal_year } = req.body;

  if (!sap_system?.base_url || !sap_system?.user || !sap_system?.password) {
    return res.status(400).json({ error: 'SAP system credentials required (base_url, user, password)' });
  }
  if (!object_id) {
    return res.status(400).json({ error: 'object_id required' });
  }

  const template = DOC_TEMPLATES[object_type];

  // If no template, try generic
  const odataPath = template
    ? template.path(object_id, company_code, fiscal_year)
    : `/sap/opu/odata/sap/API_OPLACCTGDOCITEMCUBE_SRV/A_OperationalAcctgDocItemCube?$filter=AccountingDocument eq '${object_id}'&$top=50`;

  try {
    const data = await sapFetch(
      sap_system.base_url,
      odataPath,
      sap_system.client || '000',
      sap_system.user,
      sap_system.password,
    );

    const results = data?.d?.results || data?.value || [];

    // Build Fiori link
    let fiori_link = null;
    if (template?.fiori_link) {
      const hash = template.fiori_link(object_id);
      fiori_link = `${sap_system.base_url}/sap/bc/ui2/flp?sap-client=${sap_system.client || '000'}&sap-language=${sap_system.language || 'EN'}#${hash}`;
    }

    res.json({
      object_type,
      object_id,
      fiori_link,
      items: results,
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(502).json({ error: `SAP fetch failed: ${err.message}` });
  }
});

export default router;
