import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import {z} from 'npm:zod@4.6.5';

// Deploy separately from Pages. No service key or private record enters dist-pages.
Deno.serve(async(request:Request)=>{
 const appUrl=Deno.env.get('AQR_APP_URL')||'';
 const allowed=appUrl ? new URL(appUrl).origin : '';
 const origin=request.headers.get('origin');
 const cors={'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
 const json=(data:unknown,status=200)=>Response.json(data,{status,headers:cors});
 if(!allowed||origin!==allowed)return json({error:'Asal tidak dibenarkan'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(request.method!=='POST')return json({error:'Kaedah tidak dibenarkan'},405);
 try{
  const url=Deno.env.get('SUPABASE_URL')!;
  const auth=request.headers.get('authorization')||'';
  if(!auth.startsWith('Bearer '))return json({error:'Sila log masuk'},401);
  const db=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const {data:{user},error:authError}=await db.auth.getUser();if(authError||!user)return json({error:'Sesi tidak sah'},401);
  const {data:profile}=await db.from('staff_profiles').select('id').eq('auth_user_id',user.id).eq('active',true).maybeSingle();
  if(!profile)return json({error:'Akses ditolak'},403);
  const {data:membership}=await db.from('staff_memberships').select('organization_id,role').eq('staff_id',profile.id).eq('active',true).order('created_at').limit(1).maybeSingle();
  if(!membership||!['owner','admin'].includes(membership.role))return json({error:'Akses ditolak'},403);
  const org=membership.organization_id;
  const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  if(request.headers.get('content-type')?.startsWith('multipart/form-data')){
   if(Number(request.headers.get('content-length')||0)>5500000)throw new Error('Fail terlalu besar');
   const form=await request.formData();const op=form.get('operation');
   const logo=op==='/api/logo';if(!logo&&op!=='/api/upload')throw new Error('Operasi tidak sah');
   if(logo&&membership.role!=='owner')return json({error:'Akses ditolak'},403);
   const file=form.get('file');if(!(file instanceof File)||file.size<1||file.size>(logo?2097152:5242880))throw new Error('Saiz fail tidak sah');
   const bytes=new Uint8Array(await file.arrayBuffer());const sig=[...bytes.slice(0,8)].map(n=>n.toString(16).padStart(2,'0')).join('');
   const type=sig.startsWith('ffd8ff')?'image/jpeg':sig==='89504e470d0a1a0a'?'image/png':!logo&&new TextDecoder().decode(bytes.slice(0,5))==='%PDF-'?'application/pdf':null;
   if(!type||file.type!==type)throw new Error('Jenis fail tidak sah');
   const pid=logo?null:z.uuid().parse(form.get('paymentId'));
   if(pid){const {data:p}=await db.from('payments').select('id,status').eq('organization_id',org).eq('id',pid).maybeSingle();if(!p||p.status!=='pending_verification')return json({error:'Bayaran tidak sah'},403);}
   const bucket=logo?'academy-logos':'payment-proofs';
   const path=`${org}/${pid?pid+'/':''}${crypto.randomUUID()}.${type==='image/jpeg'?'jpg':type==='image/png'?'png':'pdf'}`;
   const upload=await admin.storage.from(bucket).upload(path,bytes,{contentType:type,upsert:false});if(upload.error)throw new Error('Muat naik gagal');
   const saved=logo?await db.from('organizations').update({logo_path:path}).eq('id',org):await db.from('payment_evidence').insert({organization_id:org,payment_id:pid,path,content_type:type,size_bytes:file.size,uploaded_by:user.id});
   if(saved.error){await admin.storage.from(bucket).remove([path]);throw new Error('Rekod fail gagal disimpan');}
   return json({saved:true});
  }
  if(membership.role!=='owner')return json({error:'Akses ditolak'},403);
  const input=z.object({path:z.literal('/api/staff'),email:z.email().max(254),role:z.enum(['tutor','admin','guardian']),guardianId:z.uuid().optional()}).parse(await request.json());
  if(input.role==='guardian'){
   const {data:g}=await db.from('guardians').select('id,email,auth_user_id').eq('organization_id',org).eq('id',input.guardianId||'').maybeSingle();
   if(!g||g.auth_user_id||String(g.email).toLowerCase()!==input.email.toLowerCase())throw new Error('Penjaga tidak sepadan');
  }
  const invite=await admin.auth.admin.inviteUserByEmail(input.email,{redirectTo:appUrl});if(invite.error||!invite.data.user)throw new Error('Jemputan gagal');
  if(input.role==='guardian'){
   const saved=await admin.from('guardians').update({auth_user_id:invite.data.user.id}).eq('organization_id',org).eq('id',input.guardianId!).is('auth_user_id',null).select('id').single();if(saved.error)throw new Error('Pautan penjaga gagal');
  }else{
   const p=await admin.from('staff_profiles').insert({auth_user_id:invite.data.user.id,display_name:input.email.split('@')[0]}).select('id').single();if(p.error)throw new Error('Profil gagal');
   const m=await admin.from('staff_memberships').insert({organization_id:org,staff_id:p.data.id,role:input.role});if(m.error)throw new Error('Keahlian gagal');
  }
  await db.rpc('log_invitation',{org,target:invite.data.user.id});return json({saved:true});
 }catch{return json({error:'Operasi gagal. Semak input atau konfigurasi pentadbir.'},400);}
});
