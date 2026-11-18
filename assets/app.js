/* global supabase */
(() => {
  const cfg = window.SUPABASE_CONFIG || {};
  const client = supabase.createClient(cfg.url, cfg.publishableKey);
  const $ = (id) => document.getElementById(id);
  let currentUser = null, currentProfile = null, bkuCache = [];

  const rupiah = (n) => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
  const dateNow = () => new Date().toLocaleDateString('en-CA');
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function toast(msg){$('toast').textContent=msg;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),3000)}
  function message(id,msg,isError=false){$(id).textContent=msg;$(id).style.color=isError?'#b42318':'#0f766e'}
  function showLogin(){ $('loginView').classList.remove('hidden');$('appView').classList.add('hidden') }
  function showApp(){ $('loginView').classList.add('hidden');$('appView').classList.remove('hidden') }

  async function initSession(){
    const {data:{session}} = await client.auth.getSession();
    if(session) await loadProfile(session.user); else showLogin();
  }
  async function loadProfile(user){
    currentUser=user;
    const {data,error}=await client.from('profiles').select('*').eq('id',user.id).maybeSingle();
    if(error){showLogin();message('loginMessage','Gagal membaca profil: '+error.message,true);return}
    if(!data || !data.aktif){showLogin();message('loginMessage','Profil belum dibuat atau akun dinonaktifkan. Hubungi administrator.',true);return}
    currentProfile=data;
    $('userLabel').textContent=data.nama || user.email;
    $('roleLabel').textContent=data.role;
    showApp();
    await loadDesa();
    await loadDashboard();
    $('year').textContent=new Date().getFullYear();
  }
  async function loadDesa(){
    const {data,error}=await client.from('data_upz_desa').select('id,nama_desa').order('nama_desa');
    if(error){toast('Gagal memuat desa: '+error.message);return}
    document.querySelectorAll('.desa-options').forEach(sel=>{
      sel.innerHTML='<option value="">Pilih desa</option>'+(data||[]).map(d=>`<option value="${d.id}">${escapeHtml(d.nama_desa)}</option>`).join('');
    });
  }
  async function getTotals(){
    const [{data:income,error:e1},{data:expense,error:e2},{data:settings,error:e3}] = await Promise.all([
      client.from('penghimpunan').select('jumlah,bentuk_penerimaan'),
      client.from('pendistribusian').select('jumlah,bentuk_penyaluran'),
      client.from('app_settings').select('setting_value').eq('setting_key','saldo_awal').maybeSingle()
    ]);
    if(e1||e2||e3) throw (e1||e2||e3);
    const masuk=(income||[]).filter(x=>x.bentuk_penerimaan==='Uang').reduce((a,x)=>a+Number(x.jumlah),0);
    const keluar=(expense||[]).filter(x=>x.bentuk_penyaluran==='Uang').reduce((a,x)=>a+Number(x.jumlah),0);
    return {masuk,keluar,saldo:Number(settings?.setting_value||0)+masuk-keluar,count:(income||[]).length+(expense||[]).length};
  }
  async function loadDashboard(){
    try{
      const t=await getTotals();
      $('saldo').textContent=rupiah(t.saldo);$('totalMasuk').textContent=rupiah(t.masuk);
      $('totalKeluar').textContent=rupiah(t.keluar);$('jumlahTransaksi').textContent=t.count;
      await loadBku();
      $('latestRows').innerHTML=bkuCache.slice(0,5).map(r=>`<tr><td>${escapeHtml(r.tanggal)}</td><td>${r.jenis_transaksi==='Penerimaan'?'Penerimaan':'Pengeluaran'}</td><td>${escapeHtml(r.pihak||'-')}</td><td>${escapeHtml(r.keterangan||r.kategori||'-')}</td><td class="right">${rupiah(r.jenis_transaksi==='Penerimaan'?r.penerimaan:r.pengeluaran)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">Belum ada transaksi.</td></tr>';
    }catch(e){toast('Gagal memuat dashboard: '+e.message)}
  }
  async function loadBku(){
    const {data,error}=await client.from('v_bku').select('*').order('tanggal',{ascending:false}).limit(500);
    if(error) throw error;
    bkuCache=data||[];renderBku();
  }
  function renderBku(){
    const q=($('searchBku')?.value||'').toLowerCase();
    const rows=bkuCache.filter(r=>[r.nomor_transaksi,r.jenis_transaksi,r.kategori,r.pihak,r.keterangan].join(' ').toLowerCase().includes(q));
    $('bkuRows').innerHTML=rows.map(r=>`<tr><td>${escapeHtml(r.tanggal)}</td><td>${escapeHtml(r.nomor_transaksi||'-')}</td><td>${escapeHtml(r.jenis_transaksi)}</td><td>${escapeHtml(r.kategori||'-')}</td><td>${escapeHtml(r.pihak||'-')}</td><td class="right">${Number(r.penerimaan)>0?rupiah(r.penerimaan):'—'}</td><td class="right">${Number(r.pengeluaran)>0?rupiah(r.pengeluaran):'—'}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">Data tidak ditemukan.</td></tr>';
  }
  function navigate(page){
    document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
    $(page+'Page').classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
    $('pageTitle').textContent=({dashboard:'Dashboard',penghimpunan:'Penghimpunan',pendistribusian:'Pendistribusian',bku:'Buku Kas Umum'})[page];
    if(page==='bku') loadBku().catch(e=>toast(e.message));
  }
  function formObject(form){
    const o=Object.fromEntries(new FormData(form).entries());
    if(o.desa_id==='') o.desa_id=null; else if(o.desa_id) o.desa_id=Number(o.desa_id);
    o.jumlah=Number(o.jumlah);o.created_by=currentUser.id;o.petugas_id=currentUser.id;
    return o;
  }
  function transactionNumber(prefix){return prefix+'-'+Date.now()}
  async function saveForm(formId,table,prefix,msgId){
    const form=$(formId),btn=form.querySelector('button[type=submit]');
    form.addEventListener('submit',async ev=>{
      ev.preventDefault();btn.disabled=true;message(msgId,'Menyimpan...');
      try{
        const payload=formObject(form);payload.nomor_transaksi=transactionNumber(prefix);
        const {error}=await client.from(table).insert(payload);
        if(error) throw error;
        form.reset();form.querySelector('[name=tanggal]').value=dateNow();
        if(form.querySelector('[name=satuan]')) form.querySelector('[name=satuan]').value='Rupiah';
        message(msgId,'Data berhasil disimpan.');toast('Transaksi berhasil disimpan.');
        await loadDashboard();
      }catch(e){message(msgId,'Gagal: '+e.message,true)}
      finally{btn.disabled=false}
    });
    form.querySelector('[name=tanggal]').value=dateNow();
  }

  $('loginForm').addEventListener('submit',async e=>{
    e.preventDefault();message('loginMessage','Memeriksa akun...');
    const {data,error}=await client.auth.signInWithPassword({email:$('email').value,password:$('password').value});
    if(error){message('loginMessage',error.message,true);return}
    await loadProfile(data.user);
  });
  $('logoutBtn').addEventListener('click',async()=>{await client.auth.signOut();currentUser=null;currentProfile=null;showLogin()});
  document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.page)));
  document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.goto)));
  $('searchBku').addEventListener('input',renderBku);
  $('refreshBtn').addEventListener('click',()=>loadBku().then(loadDashboard).catch(e=>toast(e.message)));
  saveForm('incomeForm','penghimpunan','IN','incomeMessage');
  saveForm('expenseForm','pendistribusian','OUT','expenseMessage');
  client.auth.onAuthStateChange((_event,session)=>{if(!session){showLogin()}});
  initSession();
})();
