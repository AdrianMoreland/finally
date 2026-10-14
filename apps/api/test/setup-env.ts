// Pipeline tests run the whole stack on the mock providers, with jobs executed inline.
process.env['NODE_ENV'] = 'test';
process.env['DISABLE_JOBS'] = 'true';
process.env['BANK_PROVIDER'] = 'mock';
process.env['MARKET_DATA_PROVIDER'] = 'mock';
