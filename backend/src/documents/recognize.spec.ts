import { classify, findAmounts, findBank, findDates, micrGroups, mrzCheck, normalize, omrToBaisa, parseMrz, recognize } from './recognize.js';

// ICAO 9303 TD1 specimen (valid check digits)
const MRZ = ['I<UTOD231458907<<<<<<<<<<<<<<<', '7408122F1204159UTO<<<<<<<<<<<6', 'ERIKSSON<<ANNA<MARIA<<<<<<<<<<'].join('\n');

describe('text helpers', () => {
  it('turns Arabic-Indic digits into Latin', () => {
    expect(normalize('٢٠٢٧/٠٣/١٥ ٤٥٠٫٥٠٠')).toBe('2027/03/15 450.500');
  });

  it('reads dates in the usual formats', () => {
    expect(findDates('Date 15/03/2027').map((d) => d.iso)).toEqual(['2027-03-15']);
    expect(findDates('2027-3-5').map((d) => d.iso)).toEqual(['2027-03-05']);
    expect(findDates('12 Mar 2027').map((d) => d.iso)).toEqual(['2027-03-12']);
    expect(findDates('١٥-٠٣-٢٠٢٧').map((d) => d.iso)).toEqual(['2027-03-15']);
    expect(findDates('31/02/2027')).toEqual([]);
  });

  it('converts OMR amounts to baisa', () => {
    expect(omrToBaisa('1,250.500')).toBe(1250500);
    expect(omrToBaisa('450/000')).toBe(450000);
    expect(omrToBaisa('450')).toBe(450000);
    expect(omrToBaisa('12.5')).toBe(12500);
    expect(omrToBaisa('abc')).toBeNull();
  });

  it('finds amounts next to a currency or between markers', () => {
    expect(findAmounts('R.O. 450.000')[0]).toEqual({ baisa: 450000, confidence: 'medium' });
    expect(findAmounts('ريال عماني 300/500')[0].baisa).toBe(300500);
    expect(findAmounts('### 1,200.000 ###')[0].baisa).toBe(1200000);
    expect(findAmounts('total 75.250')[0]).toEqual({ baisa: 75250, confidence: 'low' });
  });

  it('knows the Omani banks in Arabic and English', () => {
    expect(findBank('BANK MUSCAT')?.en).toBe('Bank Muscat');
    expect(findBank('بنك ظفار')?.en).toBe('Bank Dhofar');
    expect(findBank('nothing here')).toBeNull();
  });
});

describe('MRZ', () => {
  it('computes ICAO check digits', () => {
    expect(mrzCheck('D23145890')).toBe(7);
    expect(mrzCheck('740812')).toBe(2);
    expect(mrzCheck('120415')).toBe(9);
  });

  it('parses the TD1 block and verifies every check digit', () => {
    const m = parseMrz(MRZ)!;
    expect(m.documentNumber).toBe('D23145890');
    expect(m.birthDate).toBe('1974-08-12');
    expect(m.expiryDate).toBe('2012-04-15');
    expect(m.sex).toBe('F');
    expect(m.surname).toBe('ERIKSSON');
    expect(m.givenNames).toBe('ANNA MARIA');
    expect(m.checks).toEqual({ documentNumber: true, birthDate: true, expiryDate: true, composite: true });
  });

  it('tolerates OCR noise (spaces, O for 0) and flags a wrong digit', () => {
    const noisy = MRZ.replace('7408122F', '74O8122F').replace(/</g, (c, i) => (i % 7 === 0 ? ' <' : c));
    expect(parseMrz(noisy)?.birthDate).toBe('1974-08-12');
    const wrong = parseMrz(MRZ.replace('7408122F', '7408132F'))!;
    expect(wrong.checks.birthDate).toBe(false);
  });

  it('returns null when there is no MRZ', () => {
    expect(parseMrz('hello\nworld')).toBeNull();
  });
});

describe('classify + recognize', () => {
  it('recognizes the back of an ID card from its MRZ, with high confidence', () => {
    const r = recognize([{ text: 'Sultanate of Oman', strip: MRZ }]);
    expect(r.kind).toBe('CIVIL_ID');
    expect(r.fields.birthDate).toEqual({ value: '1974-08-12', confidence: 'high' });
    expect(r.fields.nameEn.value).toBe('ANNA MARIA ERIKSSON');
  });

  it('reads the front of a civil ID', () => {
    const front = 'سلطنة عمان\nالبطاقة الشخصية\nالاسم: رضوان سالم الهنائي\nالرقم المدني 12345678\nتاريخ الميلاد 01/02/1990\nتاريخ الانتهاء 15/03/2029\nالجنسية: عماني';
    const r = recognize([{ text: front }]);
    expect(r.kind).toBe('CIVIL_ID');
    expect(r.fields.civilId).toEqual({ value: '12345678', confidence: 'medium' });
    expect(r.fields.expiryDate.value).toBe('2029-03-15');
    expect(r.fields.birthDate.value).toBe('1990-02-01');
    expect(r.fields.nameAr.value).toBe('رضوان سالم الهنائي');
    expect(r.fields.nationality.value).toBe('عماني');
  });

  it('reads a cheque: bank, MICR cheque number, amount and date', () => {
    const text = 'BANK MUSCAT\nPay ادفعوا لأمر  AqarTech LLC\nR.O. 450.000\nDate 01/12/2026\nA/C 0312045678901';
    const strip = '⑈004512⑈ 027001234⑆ 0312045678901⑈';
    const r = recognize([{ text, strip }]);
    expect(r.kind).toBe('CHEQUE');
    expect(r.fields.bankName.value).toBe('Bank Muscat');
    expect(r.fields.bankNameAr.value).toBe('بنك مسقط');
    expect(micrGroups(strip)).toEqual(['004512', '027001234', '0312045678901']);
    expect(r.fields.number.value).toBe('004512');
    expect(r.fields.account.value).toBe('0312045678901');
    expect(r.fields.amount).toEqual({ value: 450000, confidence: 'medium' });
    expect(r.fields.date).toEqual({ value: '2026-12-01', confidence: 'low' });
  });

  it('recognizes a lease contract and anything else, with generic fields', () => {
    expect(classify([{ text: 'عقد إيجار\nالمؤجر: ...\nالمستأجر: ...' }])).toBe('CONTRACT');
    expect(classify([{ text: 'Invoice\nTotal 10.000\nVAT 5%' }])).toBe('INVOICE');
    const r = recognize([{ text: 'Certificate\nValid until 30/06/2027\nIBAN OM81 0270 0000 1234 5678 9012\nTel 9123 4567\nmail a@b.om' }]);
    expect(r.kind).toBe('OTHER');
    expect(r.fields.expiryDate.value).toBe('2027-06-30');
    expect(r.fields.iban.value).toBe('OM810270000012345678901');
    expect(r.fields.phones.value).toEqual(['91234567']);
    expect(r.fields.emails.value).toEqual(['a@b.om']);
  });

  it('uses the hint when the user said what they are scanning', () => {
    expect(recognize([{ text: 'blurry' }], 'CHEQUE').kind).toBe('CHEQUE');
  });
});
