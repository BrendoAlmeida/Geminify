// Script de teste para verificar autenticação do Spotify
import dotenv from 'dotenv';
dotenv.config();

console.log('=== Verificação de Credenciais do Spotify ===\n');

console.log('SPOTIFY_CLIENT_ID:');
console.log(`  - Existe: ${!!process.env.SPOTIFY_CLIENT_ID}`);
console.log(`  - Comprimento: ${process.env.SPOTIFY_CLIENT_ID?.length}`);
console.log(`  - Primeiros 4 chars: ${process.env.SPOTIFY_CLIENT_ID?.substring(0, 4)}`);
console.log(`  - Últimos 4 chars: ${process.env.SPOTIFY_CLIENT_ID?.substring(process.env.SPOTIFY_CLIENT_ID.length - 4)}`);
console.log(`  - Tem espaços? ${process.env.SPOTIFY_CLIENT_ID?.includes(' ')}`);
console.log(`  - Tem quebras de linha? ${process.env.SPOTIFY_CLIENT_ID?.includes('\n') || process.env.SPOTIFY_CLIENT_ID?.includes('\r')}`);

console.log('\nSPOTIFY_CLIENT_SECRET:');
console.log(`  - Existe: ${!!process.env.SPOTIFY_CLIENT_SECRET}`);
console.log(`  - Comprimento: ${process.env.SPOTIFY_CLIENT_SECRET?.length}`);
console.log(`  - Primeiros 4 chars: ${process.env.SPOTIFY_CLIENT_SECRET?.substring(0, 4)}`);
console.log(`  - Últimos 4 chars: ${process.env.SPOTIFY_CLIENT_SECRET?.substring(process.env.SPOTIFY_CLIENT_SECRET.length - 4)}`);
console.log(`  - Tem espaços? ${process.env.SPOTIFY_CLIENT_SECRET?.includes(' ')}`);
console.log(`  - Tem quebras de linha? ${process.env.SPOTIFY_CLIENT_SECRET?.includes('\n') || process.env.SPOTIFY_CLIENT_SECRET?.includes('\r')}`);

console.log('\nSPOTIFY_REDIRECT_URI:');
console.log(`  - Valor: ${process.env.SPOTIFY_REDIRECT_URI}`);
console.log(`  - Tem espaços? ${process.env.SPOTIFY_REDIRECT_URI?.includes(' ')}`);

console.log('\n=== Teste de requisição ao Spotify ===\n');

// Testar se conseguimos fazer uma requisição básica
const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

if (clientId && clientSecret) {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  console.log('Credentials Base64 (primeiros 20 chars):', credentials.substring(0, 20));
  
  // Fazer uma requisição de teste ao endpoint de token
  console.log('\nTentando fazer uma requisição de teste...');
  
  fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  })
  .then(res => res.json())
  .then(data => {
    if (data.access_token) {
      console.log('✅ Credenciais válidas! Consegui obter um token de acesso.');
    } else {
      console.log('❌ Erro:', data);
    }
  })
  .catch(err => {
    console.log('❌ Erro na requisição:', err.message);
  });
} else {
  console.log('❌ CLIENT_ID ou CLIENT_SECRET não encontrados!');
}
