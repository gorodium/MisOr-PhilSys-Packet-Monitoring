const fs = require('fs');
let env = fs.readFileSync('.env', 'utf8');
env = env.replace(/ADMIN_PASSWORD='Pri\$oner201131460'/, 'ADMIN_PASSWORD="Pri\\$oner201131460"');
fs.writeFileSync('.env', env);
console.log('Fixed .env');
