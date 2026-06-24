import { describe, it, expect } from 'vitest';
import { scanAndRedact } from '../dlp.js';

describe('DLP — egress redaction', () => {
  it('redacts API keys / secrets', async () => {
    const r = await scanAndRedact('connect with sk-ant-abcdefghijklmnopqrstuvwx and AKIA1234567890ABCDEF now');
    expect(r.text).toContain('[REDACTED:anthropic_key]');
    expect(r.text).toContain('[REDACTED:aws_key]');
    expect(r.text).not.toMatch(/sk-ant-abcdef/);
    expect(r.total).toBe(2);
  });

  it('redacts a private key block', async () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIabc123\n-----END RSA PRIVATE KEY-----';
    const r = await scanAndRedact(`here: ${pem}`);
    expect(r.text).toContain('[REDACTED:private_key]');
    expect(r.text).not.toContain('MIIabc123');
  });

  it('redacts email + a valid (Luhn) credit card', async () => {
    const r = await scanAndRedact('mail me at john.doe@acme.com card 4111 1111 1111 1111 ok');
    expect(r.text).toContain('[REDACTED:email]');
    expect(r.text).toContain('[REDACTED:credit_card]');
  });

  it('does NOT flag an invalid card number (Luhn fails)', async () => {
    const r = await scanAndRedact('order id 1234 5678 9012 3456 7 reference');
    expect(r.text).not.toContain('[REDACTED:credit_card]');
  });

  it('does NOT flag arbitrary 11-digit numbers (TC checksum)', async () => {
    const r = await scanAndRedact('ticket number 12345678901 please');
    expect(r.text).not.toContain('[REDACTED:tc_kimlik]');
  });

  it('leaves clean text untouched', async () => {
    const clean = 'What is the capital of France?';
    const r = await scanAndRedact(clean);
    expect(r.text).toBe(clean);
    expect(r.total).toBe(0);
  });
});
