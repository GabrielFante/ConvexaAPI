import assert from 'node:assert/strict';
const base = process.env.TEST_BASE || 'http://127.0.0.1:3000';
const password = process.env.TEST_PASSWORD;
assert(password && password.length >= 16);
const call = async (path, data, token, method) => {
  const r = await fetch(base + path, {method:method || (data ? 'POST':'GET'), headers:{'content-type':'application/json',...(token ? {authorization:`Bearer ${token}`} : {})}, body:data ? JSON.stringify(data):undefined});
  const text = await r.text();
  return {status:r.status, data:text ? JSON.parse(text):null};
};
assert.equal((await call('/health')).status,200);
assert.equal((await call('/api/auth/me')).status,401);
assert.equal((await call('/internal/tenants/by-phone-number-id/test')).status,401);
assert.equal((await call('/api/auth/forgot-password',{email:'pilot@example.invalid'})).status,503);
assert.equal((await call('/api/auth/reset-password',{token:'unused',password})).status,503);
if (process.env.TEST_PHASE !== 'verify') {
  for (const id of ['one','two']) {
    const r = await call('/api/auth/register',{business:{name:`Pilot ${id}`,slug:`pilot-${id}`},owner:{name:'Pilot',email:`pilot-${id}@example.invalid`,password}});
    assert.equal(r.status,201,`register ${id}`);
  }
}
const login = async id => {
  const r = await call('/api/auth/login',{email:`pilot-${id}@example.invalid`,password});
  assert.equal(r.status,200);
  assert(r.data.accessToken);
  return r.data;
};
const one = await login('one');
assert.equal((await call('/api/auth/me',null,one.accessToken)).status,200);
if (process.env.TEST_PHASE !== 'verify') {
  assert.equal((await call('/api/services',{name:'Persistence probe',durationMinutes:30,priceCents:1000},one.accessToken)).status,201);
}
const services = await call('/api/services',null,one.accessToken);
assert.equal(services.status,200);
assert.equal(services.data.length,1);
const two = await login('two');
assert.equal((await call('/api/services',null,two.accessToken)).data.length,0);
assert.equal((await call(`/api/services/${services.data[0].id}`,null,two.accessToken)).status,404);
console.log('PASS health, auth, internal key, disabled reset, registration/login, CRUD, tenant isolation and persistence',process.env.TEST_PHASE);
