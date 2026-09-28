import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';

const SUPABASE_URL='https://hoiwyekhesluaqmtqkbs.supabase.co';
const SUPABASE_KEY='sb_publishable_gvvJkY5cpVBeN7tpq1_3pg_bwzdbAFX';
const supabase=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=s=>document.querySelector(s);

function showLogin(message=''){
  $('#authScreen').hidden=false;
  $('#authWait').hidden=true;
  $('#loginForm').hidden=false;
  $('#resetForm').hidden=true;
  $('#newPasswordForm').hidden=true;
  $('#authError').textContent=message;
  $('#accountEmail').textContent='';
}

async function applySession(session){
  $('#authScreen').hidden=false;
  $('#authWait').hidden=false;
  $('#loginForm').hidden=true;
  if(!session)return showLogin();
  const {data:{user},error:userError}=await supabase.auth.getUser();
  if(userError||!user)return showLogin('Your secure session expired. Please sign in again.');
  const {data:access,error}=await supabase.from('atlas_forge_access').select('user_id').eq('user_id',user.id).maybeSingle();
  if(error||!access){await supabase.auth.signOut();return showLogin('This account is not approved for Atlas Forge, or its beta access has expired.');}
  $('#authScreen').hidden=true;
  $('#authWait').hidden=true;
  $('#accountEmail').textContent=user.email||'';
  window.atlasForgeCurrentUser={id:user.id,email:user.email||''};
  const ownerIds=new Set(['a1a62390-14e8-4fa4-9950-6cd71dfe45a2']);
  const isOwner=ownerIds.has(user.id);
  window.atlasForgeIsOwner=isOwner;
  if($('#betaAccessBtn'))$('#betaAccessBtn').hidden=!isOwner;
  if($('#mobileBetaAccessBtn'))$('#mobileBetaAccessBtn').hidden=!isOwner;
  window.atlasForgeAuthReady=true;
  window.dispatchEvent(new CustomEvent('atlasforge:ready',{detail:window.atlasForgeCurrentUser}));
  history.replaceState({},'',location.pathname);
}

window.atlasForgeSubmitFeedback=async({feedbackType,title,details})=>{
  const {data:{user},error:userError}=await supabase.auth.getUser();
  if(userError||!user)return{error:'Your session expired. Please sign in again.'};
  const {error}=await supabase.from('atlas_forge_feedback').insert({
    user_id:user.id,
    feedback_type:feedbackType,
    title,
    details,
    page_url:location.href,
    app_version:'beta-v5'
  });
  return error?{error:error.message}:{error:null};
};

window.atlasForgeProvisionBeta=async(password)=>{
  const {data,error}=await supabase.functions.invoke('forge-beta-admin',{body:{password}});
  return error?{error:error.message||'The accounts could not be created.'}:data;
};

const {data:{session}}=await supabase.auth.getSession();
await applySession(session);

supabase.auth.onAuthStateChange((event,next)=>{
  if(event==='PASSWORD_RECOVERY'){
    $('#authScreen').hidden=false;
    $('#authWait').hidden=true;
    $('#loginForm').hidden=true;
    $('#resetForm').hidden=true;
    $('#newPasswordForm').hidden=false;
    return;
  }
  queueMicrotask(()=>applySession(next));
});

$('#loginForm').addEventListener('submit',async e=>{
  e.preventDefault();
  $('#authError').textContent='';
  const {error}=await supabase.auth.signInWithPassword({email:$('#loginEmail').value.trim(),password:$('#loginPassword').value});
  if(error)$('#authError').textContent=error.message;
});

$('#showReset').onclick=()=>{
  $('#loginForm').hidden=true;
  $('#resetForm').hidden=false;
  $('#resetEmail').value=$('#loginEmail').value.trim();
  $('#resetError').textContent='';
  $('#resetSuccess').textContent='';
  $('#resetEmail').focus();
};

$('#backToLogin').onclick=()=>showLogin();

$('#resetForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const email=$('#resetEmail').value.trim();
  const button=e.submitter;
  $('#resetError').textContent='';
  $('#resetSuccess').textContent='';
  button.disabled=true;
  button.textContent='Sending…';
  const returnUrl=location.origin+location.pathname;
  const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:returnUrl});
  button.disabled=false;
  button.textContent='Send reset link';
  if(error){$('#resetError').textContent=error.message;return;}
  $('#resetSuccess').textContent='Reset link sent. Check your inbox and spam folder.';
});

$('#newPasswordForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const password=$('#newPassword').value;
  if(password!==$('#confirmPassword').value){$('#passwordError').textContent='Passwords do not match.';return;}
  const {error}=await supabase.auth.updateUser({password});
  if(error){$('#passwordError').textContent=error.message;return;}
  $('#newPasswordForm').hidden=true;
  const {data:{session}}=await supabase.auth.getSession();
  await applySession(session);
});

const signOut=()=>supabase.auth.signOut();
$('#signOutBtn').onclick=signOut;
$('#mobileSignOutBtn').onclick=signOut;
$('#mobilePrintBtn').onclick=()=>$('#printBtn').click();
$('#mobileExportBtn').onclick=()=>$('#exportBtn').click();
$('#mobileInstallBtn').onclick=()=>$('#installBtn').click();
