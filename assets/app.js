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
    const {data,error}=await client.from('v_bku').select('*').order('tanggal',{ascending:false}).limit(10000);
    if(error) throw error;
    bkuCache=data||[];renderBku();
  }
  function renderBku(){
    const q=($('searchBku')?.value||'').toLowerCase();
    const rows=bkuCache.filter(r=>[r.nomor_transaksi,r.jenis_transaksi,r.kategori,r.pihak,r.keterangan].join(' ').toLowerCase().includes(q));
    $('bkuRows').innerHTML=rows.map(r=>{
      const kind=r.jenis_transaksi==='Penerimaan'?'penghimpunan':'pendistribusian';
      const id=Number(r.id);
      return `<tr><td>${escapeHtml(r.tanggal)}</td><td>${escapeHtml(r.nomor_transaksi||'-')}</td><td>${escapeHtml(r.jenis_transaksi)}</td><td>${escapeHtml(r.kategori||'-')}</td><td>${escapeHtml(r.pihak||'-')}</td><td class="right">${Number(r.penerimaan)>0?rupiah(r.penerimaan):'—'}</td><td class="right">${Number(r.pengeluaran)>0?rupiah(r.pengeluaran):'—'}</td><td class="actions-cell"><button class="mini-btn" data-action="receipt" data-kind="${kind}" data-id="${id}">Kwitansi</button><button class="mini-btn" data-action="edit" data-kind="${kind}" data-id="${id}">Edit</button><button class="mini-btn danger" data-action="delete" data-kind="${kind}" data-id="${id}">Hapus</button></td></tr>`;
    }).join('')||'<tr><td colspan="8" class="empty">Data tidak ditemukan.</td></tr>';
    renderPeriodReport();
  }
  function renderPeriodReport(){
    const mode=$('reportMode')?.value||'month';
    const year=$('reportYear')?.value||String(new Date().getFullYear());
    const month=$('reportMonth')?.value||String(new Date().getMonth()+1).padStart(2,'0');
    const rows=bkuCache.filter(r=>{
      const d=String(r.tanggal||'');
      return mode==='year'?d.slice(0,4)===year:d.slice(0,7)===`${year}-${month.padStart(2,'0')}`;
    }).sort((a,b)=>String(a.tanggal).localeCompare(String(b.tanggal)));
    const masuk=rows.reduce((s,r)=>s+Number(r.penerimaan||0),0);
    const keluar=rows.reduce((s,r)=>s+Number(r.pengeluaran||0),0);
    $('periodIncome').textContent=rupiah(masuk);$('periodExpense').textContent=rupiah(keluar);$('periodBalance').textContent=rupiah(masuk-keluar);
    $('periodCount').textContent=rows.length;
  }
  function printPeriodReport(){
    const mode=$('reportMode').value,year=$('reportYear').value,month=$('reportMonth').value;
    const rows=bkuCache.filter(r=>mode==='year'?String(r.tanggal).slice(0,4)===year:String(r.tanggal).slice(0,7)===`${year}-${month.padStart(2,'0')}`).sort((a,b)=>String(a.tanggal).localeCompare(String(b.tanggal)));
    const masuk=rows.reduce((s,r)=>s+Number(r.penerimaan||0),0),keluar=rows.reduce((s,r)=>s+Number(r.pengeluaran||0),0);
    const title=mode==='year'?`LAPORAN TAHUNAN ${year}`:`LAPORAN BULAN ${new Date(Number(year),Number(month)-1,1).toLocaleDateString('id-ID',{month:'long',year:'numeric'})}`;
    const body=rows.map((r,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(r.tanggal)}</td><td>${escapeHtml(r.nomor_transaksi||'-')}</td><td>${escapeHtml(r.jenis_transaksi)}</td><td>${escapeHtml(r.kategori||'-')}</td><td>${escapeHtml(r.pihak||'-')}</td><td class="num">${Number(r.penerimaan)?rupiah(r.penerimaan):'-'}</td><td class="num">${Number(r.pengeluaran)?rupiah(r.pengeluaran):'-'}</td></tr>`).join('');
    const w=window.open('','_blank','width=1100,height=800');if(!w){toast('Izinkan popup untuk mencetak laporan.');return}
    w.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${title}</title><style>body{font:12px Arial;color:#172b2a;padding:25px}h2,p{text-align:center;margin:5px}table{width:100%;border-collapse:collapse;margin-top:22px}th,td{border:1px solid #bbb;padding:7px;text-align:left}th{background:#eef4f1}.num{text-align:right}.summary{display:flex;gap:25px;margin-top:18px;font-weight:bold}.sign{display:flex;justify-content:space-between;margin:60px 30px 0;text-align:center}.sign div{width:40%}@media print{body{padding:0}}</style></head><body><h2>UNIT PENGUMPUL ZAKAT KECAMATAN CIPEUNDEUY</h2><p>Kabupaten Subang</p><h2>${title}</h2><table><thead><tr><th>No</th><th>Tanggal</th><th>No. Transaksi</th><th>Jenis</th><th>Kategori</th><th>Pihak</th><th>Penerimaan</th><th>Pengeluaran</th></tr></thead><tbody>${body||'<tr><td colspan="8">Tidak ada transaksi pada periode ini.</td></tr>'}</tbody></table><div class="summary"><span>Total Penerimaan: ${rupiah(masuk)}</span><span>Total Pengeluaran: ${rupiah(keluar)}</span><span>Selisih: ${rupiah(masuk-keluar)}</span></div><div class="sign"><div>Mengetahui,<br>Ketua UPZ Kecamatan Cipeundeuy<br><br><br><b>(................................)</b></div><div>Cipeundeuy, ${new Date().toLocaleDateString('id-ID')}<br>Bendahara<br><br><br><b>(................................)</b></div></div><script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  }
  async function editTransaction(kind,id){
    const table=kind==='penghimpunan'?'penghimpunan':'pendistribusian';
    const {data,error}=await client.from(table).select('*').eq('id',id).single();
    if(error)throw error;
    const form=$(kind==='penghimpunan'?'incomeForm':'expenseForm');
    Object.entries(data).forEach(([key,value])=>{const field=form.elements.namedItem(key);if(field && value!==null)field.value=value});
    form.dataset.editId=id;
    const btn=form.querySelector('button[type=submit]');btn.textContent='Simpan Perubahan';
    let cancel=form.querySelector('.cancel-edit');
    if(!cancel){cancel=document.createElement('button');cancel.type='button';cancel.className='secondary cancel-edit';cancel.textContent='Batal Edit';btn.after(cancel);cancel.addEventListener('click',()=>{form.reset();delete form.dataset.editId;btn.textContent=kind==='penghimpunan'?'Simpan Penghimpunan':'Simpan Pendistribusian';cancel.remove();form.querySelector('[name=tanggal]').value=dateNow()})}
    navigate(kind);
    toast('Mode edit aktif. Ubah data lalu simpan.');
  }
  async function deleteTransaction(kind,id){
    if(!confirm('Yakin ingin menghapus transaksi ini? Data yang dihapus tidak dapat dipulihkan.'))return;
    const {error}=await client.from(kind).delete().eq('id',id);
    if(error)throw error;
    toast('Transaksi berhasil dihapus.');await loadDashboard();
  }
  function printReceipt(kind,id){
    const r=bkuCache.find(x=>String(x.id)===String(id)&&((kind==='penghimpunan'&&x.jenis_transaksi==='Penerimaan')||(kind==='pendistribusian'&&x.jenis_transaksi==='Pengeluaran')));
    if(!r){toast('Transaksi tidak ditemukan. Muat ulang data.');return}
    const income=kind==='penghimpunan',amount=income?r.penerimaan:r.pengeluaran;
    const w=window.open('','_blank','width=850,height=750');if(!w){toast('Izinkan popup untuk mengunduh kwitansi.');return}
    w.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Kwitansi ${escapeHtml(r.nomor_transaksi||'')}</title><style>body{font:14px Arial;color:#172b2a;padding:30px}.receipt{max-width:700px;margin:auto;border:1px solid #aab8b2;padding:30px}.head{text-align:center;border-bottom:3px double #0f766e;padding-bottom:15px}.head h2{margin:0;color:#0f766e}.code{text-align:right;font-weight:bold;margin:20px 0}.grid{display:grid;grid-template-columns:180px 1fr;gap:12px}.amount{font-size:22px;font-weight:bold;border:1px dashed #0f766e;padding:15px;margin-top:25px}.sign{display:flex;justify-content:space-between;text-align:center;margin-top:70px}.sign div{width:40%}@media print{body{padding:0}.receipt{border:0}}</style></head><body><article class="receipt"><header class="head"><h2>UPZ KECAMATAN CIPEUNDEUY</h2><p>KABUPATEN SUBANG</p><b>BUKTI ${income?'PENERIMAAN':'PENGELUARAN'}</b></header><div class="code">No. ${escapeHtml(r.nomor_transaksi||'-')}</div><div class="grid"><b>Tanggal</b><span>${escapeHtml(r.tanggal||'-')}</span><b>Jenis / Kategori</b><span>${escapeHtml(r.kategori||'-')}</span><b>${income?'Nama Muzaki / Sumber':'Nama Penerima'}</b><span>${escapeHtml(r.pihak||'-')}</span><b>Keterangan</b><span>${escapeHtml(r.keterangan||'-')}</span></div><div class="amount">Jumlah: ${rupiah(amount)}</div><p>Terbilang: ______________________________________________ rupiah</p><div class="sign"><div>Yang menyerahkan / menerima<br><br><br><b>${escapeHtml(r.pihak||'')}</b></div><div>Petugas UPZ Kecamatan Cipeundeuy<br><br><br><b>(................................)</b></div></div></article><script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
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
        const payload=formObject(form),editId=form.dataset.editId;
        if(editId){
          delete payload.created_by;delete payload.petugas_id;delete payload.nomor_transaksi;
          const {error}=await client.from(table).update(payload).eq('id',editId);
          if(error)throw error;
          delete form.dataset.editId;
          form.querySelector('.cancel-edit')?.remove();
          btn.textContent=table==='penghimpunan'?'Simpan Penghimpunan':'Simpan Pendistribusian';
          toast('Perubahan transaksi berhasil disimpan.');
        }else{
          payload.nomor_transaksi=transactionNumber(prefix);
          const {error}=await client.from(table).insert(payload);
          if(error)throw error;
          toast('Transaksi berhasil disimpan.');
        }
        form.reset();form.querySelector('[name=tanggal]').value=dateNow();
        if(form.querySelector('[name=satuan]'))form.querySelector('[name=satuan]').value='Rupiah';
        message(msgId,'Data berhasil disimpan.');await loadDashboard();
      }catch(e){message(msgId,'Gagal: '+e.message,true)}
      finally{btn.disabled=false}
    });
    form.querySelector('[name=tanggal]').value=dateNow();
  }

  const yearSelect=$('reportYear');
  for(let y=new Date().getFullYear();y>=2020;y--){const o=document.createElement('option');o.value=String(y);o.textContent=String(y);yearSelect.append(o)}
  yearSelect.value=String(new Date().getFullYear());
  $('reportMonth').value=String(new Date().getMonth()+1).padStart(2,'0');
  $('reportMode').addEventListener('change',()=>{$('reportMonth').classList.toggle('hidden',$('reportMode').value==='year')});

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
  document.addEventListener('click',async e=>{
    const b=e.target.closest('[data-action]');if(!b)return;
    const {action,kind,id}=b.dataset;
    try{
      if(action==='receipt')printReceipt(kind,id);
      if(action==='edit')await editTransaction(kind,Number(id));
      if(action==='delete')await deleteTransaction(kind,Number(id));
    }catch(err){toast('Gagal: '+err.message)}
  });
  ['reportMode','reportYear','reportMonth'].forEach(id=>$(id).addEventListener('change',()=>{
    $('reportMonth').classList.toggle('hidden',$('reportMode').value==='year');renderPeriodReport();
  }));
  $('printPeriodBtn').addEventListener('click',printPeriodReport);
  $('refreshBtn').addEventListener('click',()=>loadBku().then(loadDashboard).catch(e=>toast(e.message)));
  saveForm('incomeForm','penghimpunan','IN','incomeMessage');
  saveForm('expenseForm','pendistribusian','OUT','expenseMessage');
  client.auth.onAuthStateChange((_event,session)=>{if(!session){showLogin()}});
  initSession();
})();
