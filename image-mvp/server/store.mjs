import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
export const hash = s => createHash('sha256').update(s).digest('hex');
export function passwordHash(password) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password,salt,64).toString('hex')}`; }
export function passwordMatches(password, stored) { const [salt,digest]=stored.split(':'); return timingSafeEqual(scryptSync(password,salt,64),Buffer.from(digest,'hex')); }
export function fail(code,message) { const e=new Error(message);e.status=code;throw e; }
export class Store {
 constructor(path) {
  this.db=new DatabaseSync(path);this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,balance INTEGER NOT NULL DEFAULT 0 CHECK(balance>=0));
  CREATE TABLE IF NOT EXISTS invites(token TEXT PRIMARY KEY, label TEXT NOT NULL, used_by TEXT UNIQUE REFERENCES users(id));
  CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),key TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('queued','processing','unknown','succeeded','failed')),image BLOB,created INTEGER NOT NULL,UNIQUE(user_id,key));
  CREATE TABLE IF NOT EXISTS ledger(id INTEGER PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),delta INTEGER NOT NULL,kind TEXT NOT NULL,reference TEXT NOT NULL UNIQUE,actor TEXT NOT NULL,note TEXT NOT NULL,created INTEGER NOT NULL);
  CREATE TRIGGER IF NOT EXISTS ledger_no_update BEFORE UPDATE ON ledger BEGIN SELECT RAISE(ABORT,'immutable ledger'); END;
  CREATE TRIGGER IF NOT EXISTS ledger_no_delete BEFORE DELETE ON ledger BEGIN SELECT RAISE(ABORT,'immutable ledger'); END;`);
 }
 get(sql,...args){return this.db.prepare(sql).get(...args);}
 all(sql,...args){return this.db.prepare(sql).all(...args);}
 run(sql,...args){return this.db.prepare(sql).run(...args);}
 tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 credit(uid,delta,kind,reference,actor,note='') {
  this.run('INSERT INTO ledger(user_id,delta,kind,reference,actor,note,created) VALUES(?,?,?,?,?,?,?)',uid,delta,kind,reference,actor,note,Date.now());
  if(!this.run('UPDATE users SET balance=balance+? WHERE id=? AND balance+?>=0',delta,uid,delta).changes)fail(402,'积分不足');
 }
 invite(label){const token=randomBytes(24).toString('base64url');this.run('INSERT INTO invites(token,label) VALUES(?,?)',hash(token),label);return token;}
 register(email,password,token){const digest=passwordHash(password);return this.tx(()=>{
  const invite=this.get('SELECT * FROM invites WHERE token=? AND used_by IS NULL',hash(token));if(!invite)fail(409,'邀请码无效或已使用');
  if(this.get('SELECT id FROM users WHERE email=?',email))fail(409,'账户已存在');
  const id=randomUUID();this.run('INSERT INTO users(id,email,password) VALUES(?,?,?)',id,email,digest);
  this.run('UPDATE invites SET used_by=? WHERE token=?',id,hash(token));this.credit(id,50,'welcome',`welcome:${id}`,'system',invite.label);return id;
 });}
 session(uid){const token=randomBytes(32).toString('base64url');this.run('INSERT INTO sessions VALUES(?,?,?)',hash(token),uid,Date.now()+7*86400000);return token;}
 user(token){return this.get('SELECT u.id,u.email,u.balance FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?',hash(token||''),Date.now());}
 reserve(uid,key,payload){return this.tx(()=>{
  const old=this.get('SELECT id,payload,status FROM jobs WHERE user_id=? AND key=?',uid,key);
  if(old){if(old.payload!==payload)fail(409,'幂等键已用于不同参数');return {id:old.id,status:old.status};}
  if(this.get("SELECT id FROM jobs WHERE user_id=? AND status IN ('queued','processing','unknown')",uid))fail(409,'请等待或处理已有任务');
  const id=randomUUID();this.credit(uid,-1,'generation',`charge:${id}`,'system');
  this.run("INSERT INTO jobs(id,user_id,key,payload,status,created) VALUES(?,?,?,?,'queued',?)",id,uid,key,payload,Date.now());return {id,status:'queued'};
 });}
 claim(){return this.tx(()=>{const job=this.get("SELECT * FROM jobs WHERE status='queued' ORDER BY created LIMIT 1");if(job)this.run("UPDATE jobs SET status='processing' WHERE id=?",job.id);return job;});}
 finish(id,status,image=null,actor='system',note='') {return this.tx(()=>{
  const j=this.get('SELECT * FROM jobs WHERE id=?',id);if(!j)fail(404,'任务不存在');
  if(['succeeded','failed'].includes(j.status)){if(j.status!==status)fail(409,'任务已结算');return;}
  if(!['processing','unknown'].includes(j.status))fail(409,'任务尚未开始');
  if(status==='succeeded'&&!image)fail(400,'成功任务必须有图片');
  if(!['succeeded','failed','unknown'].includes(status))fail(400,'无效状态');
  this.run('UPDATE jobs SET status=?,image=? WHERE id=?',status,image,id);
  if(status==='failed')this.credit(j.user_id,1,'refund',`refund:${id}`,actor,note);
 });}
 recharge(uid,receipt,actor,note){return this.tx(()=>{const ref=`offline:${receipt}`;const old=this.get('SELECT * FROM ledger WHERE reference=?',ref);if(old){if(old.user_id!==uid)fail(409,'收款编号已用于其他账户');return old;}
  if(!this.get('SELECT id FROM users WHERE id=?',uid))fail(404,'账户不存在');this.credit(uid,50,'offline',ref,actor,`990分/50点；${note}`);return this.get('SELECT * FROM ledger WHERE reference=?',ref);
 });}
 recover(){this.run("UPDATE jobs SET status='unknown' WHERE status='processing'");}
}
