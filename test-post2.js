const { SignJWT } = require('jose');

async function test() {
  const secret = new TextEncoder().encode("default_secret_key_change_me_in_production");
  const token = await new SignJWT({ userId: "cmu282dxv0008lg049h6tn154", role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .sign(secret);
    
  const id = "cmu6cnzpx000zl304bwk10i7k";
  const res = await fetch("http://localhost:3000/api/filing/" + id + "/matrix", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Cookie": "session=" + token
    },
    body: JSON.stringify({
      title: "Test Ticket",
      body: "Test Body"
    })
  });
  console.log(res.status, await res.text());
}
test();
