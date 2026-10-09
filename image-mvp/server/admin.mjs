// Local OS/SSH access is the admin boundary. No public admin endpoint/token.
import {Store} from './store.mjs';
import {png} from './provider.mjs';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
const path=resolve(process.env.DB_PATH||'data/credits.sqlite');mkdirSync(dirname(path),{recursive:true,mode:0o700});const s=new Store(path);
const [command,...args]=process.argv.slice(2);const actor=process.env.ADMIN_ACTOR;if(!actor)throw Error('ADMIN_ACTOR required for audit');
if(command==='invite'&&args[0])console.log(s.invite(args.join(' ')));
else if(command==='users')console.table(s.all('SELECT id,email,balance FROM users'));
else if(command==='unknown')console.table(s.all("SELECT id,user_id,created FROM jobs WHERE status='unknown'"));
else if(command==='recharge'&&args.length>=3)console.log(s.recharge(args[0],args[1],actor,args.slice(2).join(' ')));
else if(command==='refund'&&args.length>=2){const j=s.get('SELECT status FROM jobs WHERE id=?',args[0]);if(j?.status!=='unknown')throw Error('Only unknown jobs; first verify upstream did not generate');s.finish(args[0],'failed',null,actor,args.slice(1).join(' '));console.log('Refunded once');}
else if(command==='resolve-image'&&args.length===2){const j=s.get('SELECT status FROM jobs WHERE id=?',args[0]);if(j?.status!=='unknown')throw Error('Only unknown jobs');s.finish(args[0],'succeeded',png(readFileSync(args[1]).toString('base64')),actor);console.log('Image reconciled');}
else throw Error('Commands: invite LABEL | users | unknown | recharge USER_ID RECEIPT NOTE | refund JOB_ID VERIFIED_REASON | resolve-image JOB_ID PNG_PATH');
s.db.close();
