import {
    agendaRef,
    setDoc,
    onSnapshot
} from "./firebase.js";

/* =====================================================
   SCROLL INTELIGENTE (CABEÇALHO + CARDS CONGELADOS)
===================================================== */

function ajustarScrollFixo(){

    const header = document.querySelector("header");
    const dashboard = document.querySelector(".dashboard");

    if(header && dashboard){

        dashboard.style.top = header.offsetHeight + "px";

    }

}

window.addEventListener("resize",ajustarScrollFixo);
window.addEventListener("load",ajustarScrollFixo);
ajustarScrollFixo();

/* =====================================================
   CONFIGURAÇÃO
===================================================== */

const modoTV = window.location.search.includes("tv");

if (modoTV) {
    document.body.classList.add("tv");
}

/* =====================================================
   ELEMENTOS
===================================================== */

const tbody = document.getElementById("tbody");
const template = document.getElementById("linha");

const totalEventos = document.getElementById("totalEventos");
const eventosHoje = document.getElementById("eventosHoje");
const totalResponsaveis = document.getElementById("totalResponsaveis");
const proximoEvento = document.getElementById("proximoEvento");
const contadorBarra = document.getElementById("contadorBarra");

const textoBarra = document.getElementById("textoBarra");

const alertaEvento = document.getElementById("alertaEvento");
const tituloEvento = document.getElementById("tituloEvento");
const horaEvento = document.getElementById("horaEvento");
const contadorEvento = document.getElementById("contadorEvento");

const btnAdicionarLinha = document.getElementById("btnAdicionarLinha");
const btnRemoverLinha = document.getElementById("btnRemoverLinha");
const btnBaixarExcel = document.getElementById("btnBaixarExcel");
const btnImportarExcel = document.getElementById("btnImportarExcel");
const inputImportarExcel = document.getElementById("inputImportarExcel");

/* =====================================================
   VARIÁVEIS
===================================================== */

let salvando = false;
let salvarNovamente = false; // fica true se chegou edição nova enquanto já salvava
let timeoutSalvar = null;
let ultimaVersao = "";
let ultimoAviso = "";
let tentativasErro = 0;

const statusSalvar = document.getElementById("statusSalvar");

function definirStatusSalvar(texto, tipo){
    if(!statusSalvar) return;
    statusSalvar.textContent = texto;
    statusSalvar.className = "status-salvar" + (tipo ? " status-" + tipo : "");
}

/* =====================================================
   UTILITÁRIOS
===================================================== */

function converterData(data){

    if(!data) return null;

    const partes = data.split("/");

    let d,m,a;

    if(partes.length===2){

        [d,m] = partes;
        a = new Date().getFullYear();

    }else if(partes.length===3){

        [d,m,a] = partes;

    }else{

        return null;

    }

    return new Date(a,m-1,d);

}

function converterDataHora(data,hora){

    if(!data || !hora) return null;

    const partes = data.split("/");

    let d,m,a;

    if(partes.length===2){

        [d,m] = partes;
        a = new Date().getFullYear();

    }else if(partes.length===3){

        [d,m,a] = partes;

    }else{

        return null;

    }

    const [h,min] = hora.split(":");

    return new Date(a,m-1,d,h,min||0,0);

}

function hojeZero(){

    const hoje = new Date();

    hoje.setHours(0,0,0,0);

    return hoje;

}

function formatarTempo(ms){

    if(ms<0) ms=0;

    const total=Math.floor(ms/1000);

    const dias=Math.floor(total/86400);

    const horas=Math.floor((total%86400)/3600);

    const minutos=Math.floor((total%3600)/60);

    const segundos=total%60;

    if(dias>0){

        return `${dias}d ${horas}h ${minutos}min`;

    }

    if(horas>0){

        return `${horas}h ${minutos}min`;

    }

    return `${minutos}min ${segundos}s`;

}

function formatarDataCurta(data){

    if(!data) return "";

    const partes = data.trim().split("/");

    if(partes.length>=2){

        return `${partes[0]}/${partes[1]}`;

    }

    return data;

}

/* =====================================================
   CRIAR LINHA
===================================================== */

function criarLinha(item = {

    inicio:"",
    fim:"",
    horario:"",
    aviso:"15",
    periodo:"",
    acao:"",
    responsavel:""

}){

    const clone = template.content.cloneNode(true);

    const tr = clone.querySelector("tr");

    const td = tr.querySelectorAll("td");

    td[0].textContent = formatarDataCurta(item.inicio);
    td[1].textContent = formatarDataCurta(item.fim);
    td[2].textContent = item.horario || "";
    td[3].textContent = item.aviso || "15";
    td[4].textContent = item.periodo || "";
    td[5].textContent = item.acao || "";
    td[6].textContent = item.responsavel || "";

    td.forEach(campo=>{

        campo.contentEditable = !modoTV;

        if(!modoTV){

            campo.addEventListener("input",agendarSalvar);

            campo.addEventListener("blur",()=>{

                atualizarIndicadores();

                monitorarEventos();

            });

            campo.addEventListener("keydown",e=>{

                if(e.key==="Enter"){

                    e.preventDefault();

                    campo.blur();

                }

            });

        }

    });

    // Botão de excluir a linha inteira (fora do modo TV).
    // A célula é criada depois do forEach acima, então não é editável
    // e não entra em lerTabela() (que só lê as colunas 0 a 6).
    if(!modoTV){

        const tdExcluir = document.createElement("td");
        tdExcluir.className = "col-excluir";
        tdExcluir.contentEditable = false;

        const btn = document.createElement("span");
        btn.className = "btn-excluir-linha";
        btn.textContent = "✕";
        btn.title = "Excluir este evento";
        btn.setAttribute("role","button");
        btn.tabIndex = 0;

        btn.addEventListener("click",()=>excluirLinha(tr));

        btn.addEventListener("keydown",e=>{

            if(e.key==="Enter" || e.key===" "){

                e.preventDefault();

                excluirLinha(tr);

            }

        });

        tdExcluir.appendChild(btn);
        tr.appendChild(tdExcluir);

    }

    tbody.appendChild(tr);

    return tr;

}

/* =====================================================
   ADICIONAR / REMOVER LINHA
===================================================== */

function adicionarLinha() {

    const linha = criarLinha();

    atualizarIndicadores();

    monitorarEventos();

    agendarSalvar();

    // Aguarda a linha ser renderizada
    setTimeout(() => {

        try {

            console.log("Direcionando para a nova linha:", linha);

            linha.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });

            const primeiraCelula = linha.querySelector("td");

            if (primeiraCelula) {

                primeiraCelula.focus();

            }

            // destaca a linha inteira temporariamente
            linha.style.outline = "3px solid #FFC107";
            linha.style.background = "#FFF59D";

            setTimeout(() => {
                linha.style.outline = "";
                linha.style.background = "";
            }, 1500);

        } catch (erro) {

            console.error("Erro ao direcionar para a nova linha:", erro);

        }

    }, 50);

}

function removerLinha(){

    const linhas = tbody.querySelectorAll("tr");

    if(linhas.length===0) return;

    linhas[linhas.length-1].remove();

    atualizarIndicadores();

    monitorarEventos();

    agendarSalvar();

}

function excluirLinha(tr){

    const titulo = tr.querySelectorAll("td")[5].textContent.trim() || "sem título";

    if(!confirm(`Excluir o evento "${titulo}"?`)) return;

    tr.remove();

    atualizarIndicadores();

    monitorarEventos();

    agendarSalvar();

}

// Cabeçalho da coluna do botão de excluir (fora do modo TV)
function adicionarColunaExcluir(){

    if(modoTV) return;

    const trHead = document.querySelector("#agenda thead tr");

    if(trHead && !trHead.querySelector(".col-excluir")){

        const th = document.createElement("th");
        th.className = "col-excluir";
        trHead.appendChild(th);

    }

}

adicionarColunaExcluir();

if(!modoTV && btnAdicionarLinha && btnRemoverLinha){

    btnAdicionarLinha.addEventListener("click",adicionarLinha);

    btnRemoverLinha.addEventListener("click",removerLinha);

}

if(btnBaixarExcel){

    btnBaixarExcel.addEventListener("click",baixarExcel);

}

if(btnImportarExcel && inputImportarExcel){

    btnImportarExcel.addEventListener("click",()=>{

        inputImportarExcel.click();

    });

    inputImportarExcel.addEventListener("change",(e)=>{

        const arquivo = e.target.files[0];

        if(arquivo){

            importarExcel(arquivo);

        }

        e.target.value = "";

    });

}

/* =====================================================
   BAIXAR / IMPORTAR EXCEL
===================================================== */

function baixarExcel(){

    try{

        const dados = lerTabela();

        const linhasFormatadas = dados.map(item=>({

            "Início": item.inicio,
            "Fim": item.fim,
            "Horário": item.horario,
            "Aviso (min)": item.aviso,
            "Período": item.periodo,
            "Ação": item.acao,
            "Responsável": item.responsavel

        }));

        const planilha = XLSX.utils.json_to_sheet(linhasFormatadas);

        const livro = XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(livro,planilha,"Agenda");

        const dataHoje = new Date().toISOString().slice(0,10);

        XLSX.writeFile(livro,`agenda_${dataHoje}.xlsx`);

    }catch(erro){

        console.error("Erro ao gerar Excel:",erro);

        alert("Não foi possível gerar o arquivo Excel.");

    }

}

function importarExcel(arquivo){

    const leitor = new FileReader();

    leitor.onload = (evento)=>{

        try{

            const dadosBrutos = new Uint8Array(evento.target.result);

            const livro = XLSX.read(dadosBrutos,{type:"array"});

            const planilha = livro.Sheets[livro.SheetNames[0]];

            const linhas = XLSX.utils.sheet_to_json(planilha,{defval:""});

            if(!linhas.length){

                alert("A planilha importada está vazia.");

                return;

            }

            tbody.innerHTML = "";

            linhas.forEach(linha=>{

                criarLinha({

                    inicio: String(linha["Início"] ?? linha["Inicio"] ?? "").trim(),
                    fim: String(linha["Fim"] ?? "").trim(),
                    horario: String(linha["Horário"] ?? linha["Horario"] ?? "").trim(),
                    aviso: String(linha["Aviso (min)"] ?? linha["Aviso"] ?? "15").trim(),
                    periodo: String(linha["Período"] ?? linha["Periodo"] ?? "").trim(),
                    acao: String(linha["Ação"] ?? linha["Acao"] ?? "").trim(),
                    responsavel: String(linha["Responsável"] ?? linha["Responsavel"] ?? "").trim()

                });

            });

            destacarEventos();
            colorirLinhas();
            atualizarIndicadores();
            monitorarEventos();
            agendarSalvar();

        }catch(erro){

            console.error("Erro ao importar Excel:",erro);

            alert("Não foi possível importar o arquivo. Verifique se é uma planilha Excel válida.");

        }

    };

    leitor.readAsArrayBuffer(arquivo);

}

/* =====================================================
   LER TABELA
===================================================== */

function lerTabela(){

    const agenda=[];

    tbody.querySelectorAll("tr").forEach(tr=>{

        const td=tr.querySelectorAll("td");

        agenda.push({

            inicio:td[0].textContent.trim(),

            fim:td[1].textContent.trim(),

            horario:td[2].textContent.trim(),

            aviso:td[3].textContent.trim() || "15",

            periodo:td[4].textContent.trim(),

            acao:td[5].textContent.trim(),

            responsavel:td[6].textContent.trim()

        });

    });

    return agenda;

}

/* =====================================================
   SALVAR
===================================================== */

function agendarSalvar(){

    definirStatusSalvar("Alterações pendentes…", "pendente");

    clearTimeout(timeoutSalvar);

    timeoutSalvar = setTimeout(()=>{

        salvarFirebase();

    },500);

}

async function salvarFirebase(){

    // Em vez de descartar esta chamada, marca para rodar de novo
    // assim que o salvamento atual terminar. Antes, isso era perdido.
    if(salvando){

        salvarNovamente = true;
        return;

    }

    salvando = true;
    definirStatusSalvar("Salvando…", "salvando");

    try{

        const agenda = lerTabela();

        ultimaVersao = JSON.stringify(agenda);

        await setDoc(agendaRef,{

            agenda,

            atualizadoEm:new Date().toISOString()

        });

        tentativasErro = 0;
        definirStatusSalvar("Salvo ✓", "salvo");

    }catch(erro){

        console.error(erro);

        tentativasErro++;

        definirStatusSalvar(
            "⚠ Erro ao salvar — tentando novamente…",
            "erro"
        );

        // Tenta de novo automaticamente (com espera crescente),
        // em vez de simplesmente desistir e perder a edição.
        salvando = false;

        const espera = Math.min(2000 * tentativasErro, 15000);

        setTimeout(salvarFirebase, espera);

        if(tentativasErro >= 4){

            alert(
                "Não foi possível salvar as últimas alterações na agenda há vários minutos. " +
                "Verifique sua conexão com a internet. Se o problema continuar, avise o suporte " +
                "— pode ser um problema de permissão no Firebase."
            );

        }

        return;

    }

    salvando = false;

    if(salvarNovamente){

        salvarNovamente = false;
        salvarFirebase();

    }

}

// Avisa antes de fechar/recarregar a aba se houver algo ainda não salvo
window.addEventListener("beforeunload", (e) => {

    if(salvando || timeoutSalvar){

        e.preventDefault();
        e.returnValue = "";

    }

});

/* =====================================================
   FIREBASE
===================================================== */

onSnapshot(agendaRef,async(snapshot)=>{

    if(!snapshot.exists()){

        // Só cria o documento vazio se ele realmente nunca existiu.
        // (Se isso disparar depois de já ter havido dados, é sinal de
        // que o documento foi apagado no Firestore — não escondemos mais o aviso.)
        console.warn("Documento 'agenda/principal' não existe. Criando um novo vazio.");

        await setDoc(agendaRef,{

            agenda:[],

            atualizadoEm:new Date().toISOString()

        });

        return;

    }

    const dados = snapshot.data();

    const agenda = dados.agenda || [];

    const json = JSON.stringify(agenda);

    if(json===ultimaVersao) return;

    ultimaVersao = json;

    desenharTabela(agenda);

},(erro)=>{

    // Antes, um erro aqui (ex: permissão negada nas regras do Firestore,
    // ou sem internet) passava totalmente despercebido.
    console.error("Erro ao sincronizar com o Firestore:", erro);

    definirStatusSalvar("⚠ Sem conexão com o banco de dados", "erro");

    if(erro.code === "permission-denied"){

        alert(
            "Sem permissão para acessar a agenda no Firebase. " +
            "As regras de segurança do Firestore podem ter mudado. " +
            "Avise o responsável técnico."
        );

    }

});

function desenharTabela(lista){

    const hoje = hojeZero();

    lista.sort((a,b)=>{

        const inicioA = converterData(a.inicio);
        const fimA = converterData(a.fim);

        const inicioB = converterData(b.inicio);
        const fimB = converterData(b.fim);

        const hojeA =
            inicioA && fimA &&
            hoje >= inicioA &&
            hoje <= fimA;

        const hojeB =
            inicioB && fimB &&
            hoje >= inicioB &&
            hoje <= fimB;

        if(hojeA && !hojeB) return -1;
        if(!hojeA && hojeB) return 1;

        const futuroA = inicioA && inicioA >= hoje;
        const futuroB = inicioB && inicioB >= hoje;

        if(futuroA && !futuroB) return -1;
        if(!futuroA && futuroB) return 1;

        return inicioA - inicioB;

    });

    tbody.innerHTML="";

    lista.forEach(item=>criarLinha(item));

    destacarEventos();
    colorirLinhas();
    atualizarIndicadores();

    monitorarEventos();

}

function destacarEventos(){

    const hoje = hojeZero();

    tbody.querySelectorAll("tr").forEach(tr=>{

        tr.classList.remove("evento-hoje");

        const td = tr.querySelectorAll("td");

        const inicio = converterData(td[0].textContent);

        const fim = converterData(td[1].textContent);

        if(!inicio || !fim) return;

        if(hoje >= inicio && hoje <= fim){

            tr.classList.add("evento-hoje");

        }

    });

}

function atualizarIndicadores(){

    const linhas = tbody.querySelectorAll("tr");

    totalEventos.textContent = linhas.length;

    const hoje = hojeZero();

    let eventosAtivos = 0;

    const responsaveis = new Set();

    linhas.forEach(tr=>{

        const td = tr.querySelectorAll("td");

        const inicio = converterData(td[0].textContent);

        const fim = converterData(td[1].textContent);

        if(inicio && fim){

            if(hoje >= inicio && hoje <= fim){

                eventosAtivos++;

            }

        }

        if(td[6].textContent.trim()){

            responsaveis.add(
                td[6].textContent.trim()
            );

        }

    });

    eventosHoje.textContent = eventosAtivos;

    if(totalResponsaveis){

        totalResponsaveis.textContent =
            responsaveis.size;

    }

}

function monitorarEventos(){

    const agora = new Date();

    let proximo = null;

    let menorTempo = Infinity;

    tbody.querySelectorAll("tr").forEach(tr=>{

        tr.classList.remove("evento-urgente");

        const td = tr.querySelectorAll("td");

        const inicio = converterDataHora(
            td[0].textContent.trim(),
            td[2].textContent.trim()
        );

        if(!inicio) return;

        const diferenca = inicio - agora;

        if(diferenca >= 0 && diferenca < menorTempo){

            menorTempo = diferenca;

            proximo = {

                linha:tr,

                titulo:td[5].textContent.trim(),

                horario:td[2].textContent.trim(),

                aviso:parseInt(td[3].textContent.trim() || "15"),

                inicio:inicio

            };

        }

    });

    if(!proximo){

        if(proximoEvento) proximoEvento.textContent="Sem eventos";

        textoBarra.textContent="Nenhum evento programado.";

        if(contadorBarra) contadorBarra.textContent="--";

        return;

    }

    if(proximoEvento) proximoEvento.textContent = formatarTempo(menorTempo);

    textoBarra.textContent =
        `${proximo.titulo} • ${proximo.horario}`;

    if(contadorBarra) contadorBarra.textContent = formatarTempo(menorTempo);

    if(menorTempo <= 300000){

        proximo.linha.classList.add("evento-urgente");

    }

    dispararAviso(proximo);

}

function dispararAviso(evento){

    const agora = new Date();

    const restante = Math.ceil(
        (evento.inicio-agora)/60000
    );

    if(restante !== evento.aviso) return;

    const chave =
        evento.titulo +
        evento.horario +
        evento.inicio.toDateString();

    if(chave === ultimoAviso) return;

    ultimoAviso = chave;

    tituloEvento.textContent = evento.titulo;

    horaEvento.textContent =
        "Início às " + evento.horario;

    contadorEvento.textContent =
        "Faltam " + evento.aviso + " minutos";

    alertaEvento.style.display="flex";

    tocarSom();

    setTimeout(()=>{

        alertaEvento.style.display="none";

    },15000);

}

function tocarSom(){

    const audio = new Audio("alerta.mp3");

    audio.volume = 1;

    audio.play().catch(()=>{

        console.log("Som bloqueado pelo navegador.");

    });

    setTimeout(()=>{

        audio.pause();

        audio.currentTime = 0;

    },3000);

}

setInterval(monitorarEventos,5000);

function colorirLinhas(){

    const hoje = hojeZero();

    tbody.querySelectorAll("tr").forEach(tr=>{

        tr.classList.remove(
            "periodo-manha",
            "periodo-tarde",
            "periodo-noite",
            "periodo-integral",
            "evento-passado"
        );

        const td = tr.querySelectorAll("td");

        const periodo = td[4].textContent
            .trim()
            .toLowerCase();

        if(periodo.includes("manhã"))
            tr.classList.add("periodo-manha");

        if(periodo.includes("tarde"))
            tr.classList.add("periodo-tarde");

        if(periodo.includes("noite"))
            tr.classList.add("periodo-noite");

        if(periodo.includes("integral"))
            tr.classList.add("periodo-integral");

        const fim = converterData(td[1].textContent);

        if(fim && fim < hoje){

            tr.classList.add("evento-passado");

        }

    });

}

/* =====================================================
   RECARREGAMENTO AUTOMÁTICO (MODO TV)
===================================================== */

if (modoTV) {

    // Recarrega a página a cada 15 minutos
    setInterval(() => {

        console.log("Recarregando painel...");

        location.replace(location.href);

    }, 15 * 60 * 1000);

}

/* ===========================
   NOTÍCIAS G1 NO TICKER
=========================== */

const RSS_G1 = 'https://g1.globo.com/rss/g1/educacao/';
// troque por 'https://g1.globo.com/rss/g1/' se quiser notícias gerais,
// em vez de só educação

// Extrai os títulos de um XML de RSS (string) já resolvido
function extrairManchetesDeXml(textoXml) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(textoXml, 'text/xml');

    // Se o parser encontrar um erro de sintaxe, o XML retornado contém <parsererror>
    if (xml.querySelector('parsererror')) {
        throw new Error('XML inválido/parsererror ao interpretar o RSS.');
    }

    const itens = xml.querySelectorAll('item');

    return Array.from(itens)
        .slice(0, 8)
        .map(item => item.querySelector('title')?.textContent.trim())
        .filter(Boolean);
}

// Fonte 1: rss2json — feito especificamente para converter RSS em JSON,
// mais estável que proxies genéricos de CORS.
async function buscarViaRss2json() {
    const url = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(RSS_G1);
    const resposta = await fetch(url);

    if (!resposta.ok) {
        throw new Error(`rss2json respondeu status ${resposta.status}`);
    }

    const dados = await resposta.json();

    if (dados.status !== 'ok' || !Array.isArray(dados.items)) {
        throw new Error('rss2json não retornou itens válidos: ' + JSON.stringify(dados).slice(0, 200));
    }

    return dados.items
        .slice(0, 8)
        .map(item => (item.title || '').trim())
        .filter(Boolean);
}

// Fonte 2 (fallback): allorigins — usado apenas se o rss2json falhar
async function buscarViaAllorigins() {
    const proxy = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(RSS_G1);
    const resposta = await fetch(proxy);

    if (!resposta.ok) {
        throw new Error(`allorigins respondeu status ${resposta.status}`);
    }

    const textoXml = await resposta.text();
    return extrairManchetesDeXml(textoXml);
}

// Fonte 3 (fallback final): corsproxy.io
async function buscarViaCorsproxy() {
    const proxy = 'https://corsproxy.io/?url=' + encodeURIComponent(RSS_G1);
    const resposta = await fetch(proxy);

    if (!resposta.ok) {
        throw new Error(`corsproxy.io respondeu status ${resposta.status}`);
    }

    const textoXml = await resposta.text();
    return extrairManchetesDeXml(textoXml);
}

async function carregarNoticiasG1() {
    const fontes = [
        { nome: 'rss2json', buscar: buscarViaRss2json },
        { nome: 'allorigins', buscar: buscarViaAllorigins },
        { nome: 'corsproxy.io', buscar: buscarViaCorsproxy }
    ];

    for (const fonte of fontes) {
        try {
            const manchetes = await fonte.buscar();

            if (manchetes.length) {
                document.getElementById('avisos').textContent =
                    manchetes.map(m => `📰 ${m}`).join('     •     ');

                console.log(`Notícias carregadas via ${fonte.nome} (${manchetes.length} itens).`);
                return; // sucesso — não tenta as próximas fontes
            }

            console.log(`Fonte ${fonte.nome} respondeu, mas sem manchetes.`);

        } catch (erro) {
            console.log(`Falha ao carregar notícias via ${fonte.nome}:`, erro.message || erro);
            // tenta a próxima fonte da lista
        }
    }

    console.log('Não foi possível carregar notícias do G1 em nenhuma fonte. Mantendo texto atual do ticker.');
}

carregarNoticiasG1();
setInterval(carregarNoticiasG1, 10 * 60 * 1000); // atualiza a cada 10 minutos
