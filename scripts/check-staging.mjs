const input = process.argv[2];

try {
  if (!input) throw new Error('Informe a URL HTTPS do staging');
  const base = new URL(input);
  if (base.protocol !== 'https:' || base.username || base.password) {
    throw new Error('Use uma URL HTTPS sem credenciais');
  }
  const response = await fetch(new URL('/health/ready', base), {
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
    headers: { Accept: 'application/json' },
  });
  if (response.status !== 200) {
    throw new Error(`Readiness respondeu HTTP ${response.status}`);
  }
  const body = await response.json();
  if (body?.status !== 'ok') throw new Error('Resposta de readiness inesperada');
  console.log('Staging acessível por HTTPS; readiness confirmado');
} catch (error) {
  console.error(
    error instanceof Error && ['TypeError', 'TimeoutError', 'SyntaxError'].includes(error.name)
      ? 'Não foi possível validar o staging; confira rede, TLS e resposta HTTP'
      : error instanceof Error ? error.message : 'Falha ao verificar staging',
  );
  process.exitCode = 1;
}
