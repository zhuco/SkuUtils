import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {App,ConfigProvider,Card,Form,Input,Button,Space,Typography,Alert,List,Tag} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import 'antd/dist/reset.css';
type User={id:string;email:string;balance:number};type Job={id:string;status:string};
async function api(path:string,options:RequestInit={}){const res=await fetch('/api'+path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers}});const body=await res.json();if(!res.ok)throw Error(body.error||'请求失败');return body;}
function Workbench(){
 const {message}=App.useApp();const [user,setUser]=useState<User|null>(null),[jobs,setJobs]=useState<Job[]>([]),[register,setRegister]=useState(false),[prompt,setPrompt]=useState(''),[busy,setBusy]=useState(false);
 const [pending,setPending]=useState<{key:string;prompt:string}|null>(()=>{try{return JSON.parse(sessionStorage.getItem('image_pending')||'null');}catch{return null;}});
 const refresh=async()=>{try{setUser(await api('/me'));setJobs(await api('/generations'));}catch{setUser(null);}};
 useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),5000);return()=>clearInterval(timer);},[]);
 const login=async(values:Record<string,string>)=>{setBusy(true);try{await api(register?'/register':'/login',{method:'POST',body:JSON.stringify(values)});await refresh();}catch(e){message.error((e as Error).message);}finally{setBusy(false);}};
 const generate=async()=>{const request=pending||{key:crypto.randomUUID(),prompt};setPending(request);sessionStorage.setItem('image_pending',JSON.stringify(request));setBusy(true);try{await api('/generations',{method:'POST',headers:{'Idempotency-Key':request.key},body:JSON.stringify({prompt:request.prompt})});setPending(null);sessionStorage.removeItem('image_pending');await refresh();}catch(e){message.error((e as Error).message);}finally{setBusy(false);}};
 return <main style={{maxWidth:800,margin:'40px auto',padding:20}}><Typography.Title level={2}>电商主图 · 朋友体验版</Typography.Title>
 <Alert type="info" showIcon message="注册赠送50点，每张1点；线下充值9.9元/50点，请联系管理员。"/>
 {!user?<Card style={{marginTop:20}} title={register?'邀请码注册':'登录'}><Form onFinish={login} layout="vertical"><Form.Item name="email" label="邮箱" rules={[{required:true,type:'email'}]}><Input autoComplete="username"/></Form.Item><Form.Item name="password" label="密码（至少12位）" rules={[{required:true,min:12}]}><Input.Password autoComplete={register?'new-password':'current-password'}/></Form.Item>{register&&<Form.Item name="invite" label="管理员提供的一次性邀请码" rules={[{required:true}]}><Input/></Form.Item>}<Space><Button htmlType="submit" type="primary" loading={busy}>提交</Button><Button onClick={()=>setRegister(!register)}>切换到{register?'登录':'注册'}</Button></Space></Form></Card>:<>
 <Card style={{marginTop:20}} title={`${user.email} · 剩余 ${user.balance} 点`} extra={<Button onClick={async()=>{await api('/logout',{method:'POST',body:'{}'});await refresh();}}>退出</Button>}>
 <Typography.Paragraph>账户编号：{user.id}（线下充值时提供）</Typography.Paragraph><Input.TextArea rows={5} value={prompt} disabled={!!pending} maxLength={4000} onChange={e=>setPrompt(e.target.value)} placeholder="描述商品、背景、卖点及主图要求"/>
 <Button style={{marginTop:12}} type="primary" loading={busy} disabled={!pending&&!prompt.trim()} onClick={()=>void generate()}>{pending?'重试同一请求（不会重复扣费）':'生成一张 · 1点'}</Button>
 {pending&&<Button onClick={()=>{setPending(null);sessionStorage.removeItem('image_pending');}}>取消本地重试</Button>}
 </Card><List header="生成记录" dataSource={jobs} renderItem={job=><List.Item><Space><Tag>{({queued:'排队中',processing:'生成中',unknown:'结果待核查，请联系管理员',failed:'失败，积分已返还',succeeded:'已完成'} as Record<string,string>)[job.status]}</Tag><Typography.Text copyable>{job.id}</Typography.Text>{job.status==='succeeded'&&<a href={`/api/generations/${job.id}/image`} target="_blank" rel="noreferrer">查看图片</a>}</Space></List.Item>}/></>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<ConfigProvider locale={zhCN} theme={{token:{colorPrimary:'#176a5b',borderRadius:14}}}><App><Workbench/></App></ConfigProvider>);
