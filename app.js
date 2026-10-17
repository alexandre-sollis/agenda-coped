import {
    agendaRef,
    setDoc,
    onSnapshot
} from "./firebase.js";

/* =====================================================
   COMPATIBILIDADE: este arquivo evita sintaxe moderna
   (?. , ?? , etc.) para rodar em navegadores de TV antigos.
===================================================== */

/* =====================================================
   CONFIGURAÇÃO / MODO TV  (abra a TV com ?tv=1 no final do link)
===================================================== */

const modoTV = window.location.search.indexOf("tv") !== -1;

if (modoTV) {
    document.body.classList.add("tv");
}

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

/* No modo TV, esconde todos os botões de edição */
if(modoTV){

    [btnAdicionarLinha, btnRemoverLinha, btnBaixarExcel, btnImportarExcel].forEach(function(b){

        if(b) b.style.display = "none";

    });

}

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

/* Mensagem de erro visível na tela (substitui alert(), que trava a TV) */
function mostrarErroTela(texto){

    let el = document.getElementById("erroTela");

    if(!el){

        el = document.createElement("div");
        el.id = "erroTela";
        document.body.appendChild(el);

    }

    el.textContent = texto || "";
    el.style.display = texto ? "block" : "none";

}

/* =====================================================
   UTILITÁRIOS
===================================================== */

function pad(n){

    return (n < 10 ? "0" : "") + n;

}

function converterData(data){

    if(!data) return null;

    const partes = String(data).trim().split("/");

    let d, m, a;

    if(partes.length === 2){

        d = partes[0];
        m = partes[1];
        a = new Date().getFullYear();

    }else if(partes.length === 3){

        d = partes[0];
        m = partes[1];
        a = partes[2];

    }else{

        return null;

    }

    d = parseInt(d,10);
    m = parseInt(m,10);
    a = parseInt(a,10);

    if(isNaN(d) || isNaN(m) || isNaN(a)) return null;

    if(a < 100) a += 2000;

    return new Date(a, m-1, d);

}

/* Lê horários como "07:30", "14h30", "8h", "8:30h às 11h" (usa o primeiro) */
function lerHora(texto){

    const m = String(texto || "").match(/(\d{1,2})\s*(?:[:hH]\s*(\d{2}))?/);

    if(!m) return null;

    return {
        h: parseInt(m[1],10),
        min: m[2] ? parseInt(m[2],10) : 0
    };

}

function converterDataHora(data,hora){

    const d = converterData(data);
    const t = lerHora(hora);

    if(!d || !t) return null;

    d.setHours(t.h, t.min, 0, 0);

    return d;

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

/* Mostra dd/mm quando o ano é o atual; senão mostra a data completa */
function formatarDataCurta(data){

    if(!data) return "";

    const partes = String(data).trim().split("/");

    if(partes.length === 3){

        if(parseInt(partes[2],10) === new Date().getFullYear()){

            return `${partes[0]}/${partes[1]}`;

        }

        return String(data).trim();

    }

    return String(data).trim();

}

/* Ao salvar, garante o ano na data (evita perder o ano de eventos futuros) */
function completarAno(data){

    const texto = String(data || "").trim();

    const partes = texto.split("/");

    if(partes.length === 2 && partes[0] && partes[1]){

        return `${partes[0]}/${partes[1]}/${new Date().getFullYear()}`;

    }

    return texto;

}

/* Conversões para células vindas do Excel (datas e horas podem vir como número) */
function textoData(v){

    if(typeof v === "number" && window.XLSX && XLSX.SSF){

        const p = XLSX.SSF.parse_date_code(v);

        if(p) return `${pad(p.d)}/${pad(p.m)}/${p.y}`;

    }

    return String(v == null ? "" : v).trim();

}

function textoHora(v){

    if(typeof v === "number" && v > 0 && v < 1){

        const total = Math.round(v * 24 * 60);

        return `${pad(Math.floor(total/60))}:${pad(total%60)}`;

    }

    return String(v == null ? "" : v).trim();

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

    td.forEach(function(campo){

        campo.contentEditable = !modoTV;

        if(!modoTV){

            campo.addEventListener("input",agendarSalvar);

            campo.addEventListener("blur",function(){

                atualizarIndicadores();

                monitorarEventos();

            });

            campo.addEventListener("keydown",function(e){

                if(e.key==="Enter"){

                    e.preventDefault();

                    campo.blur();

                }

            });

        }

    });

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
    setTimeout(function(){

        try {

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

            setTimeout(function(){
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

if(!modoTV && btnAdicionarLinha && btnRemoverLinha){

    btnAdicionarLinha.addEventListener("click",adicionarLinha);

    btnRemoverLinha.addEventListener("click",removerLinha);

}

if(!modoTV && btnBaixarExcel){

    btnBaixarExcel.addEventListener("click",baixarExcel);

}

if(!modoTV && btnImportarExcel && inputImportarExcel){

    btnImportarExcel.addEventListener("click",function(){

        inputImportarExcel.click();

    });

    inputImportarExcel.addEventListener("change",function(e){

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

        const linhasFormatadas = dados.map(function(item){

            return {

                "Início": item.inicio,
                "Fim": item.fim,
                "Horário": item.horario,
                "Aviso (min)": item.aviso,
                "Período": item.periodo,
                "Ação": item.acao,
                "Responsável": item.responsavel

            };

        });

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

    leitor.onload = function(evento){

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

            linhas.forEach(function(linha){

                criarLinha({

                    inicio: textoData(linha["Início"] || linha["Inicio"] || ""),
                    fim: textoData(linha["Fim"] || ""),
                    horario: textoHora(linha["Horário"] || linha["Horario"] || ""),
                    aviso: String(linha["Aviso (min)"] || linha["Aviso"] || "15").trim(),
                    periodo: String(linha["Período"] || linha["Periodo"] || "").trim(),
                    acao: String(linha["Ação"] || linha["Acao"] || "").trim(),
                    responsavel: String(linha["Responsável"] || linha["Responsavel"] || "").trim()

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

    tbody.querySelectorAll("tr").forEach(function(tr){

        const td=tr.querySelectorAll("td");

        agenda.push({

            inicio:completarAno(td[0].textContent),

            fim:completarAno(td[1].textContent),

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

    if(modoTV) return; // a TV nunca grava

    definirStatusSalvar("Alterações pendentes…", "pendente");

    clearTimeout(timeoutSalvar);

    timeoutSalvar = setTimeout(function(){

        timeoutSalvar = null; // importante: senão o aviso de "sair da página" nunca some

        salvarFirebase();

    },500);

}

async function salvarFirebase(){

    if(modoTV) return;

    // Em vez de descartar esta chamada, marca para rodar de novo
    // assim que o salvamento atual terminar.
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

        // Tenta de novo automaticamente (com espera crescente)
        salvando = false;

        const espera = Math.min(2000 * tentativasErro, 15000);

        setTimeout(salvarFirebase, espera);

        if(tentativasErro === 4){ // avisa uma vez só

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
window.addEventListener("beforeunload", function(e){

    if(!modoTV && (salvando || timeoutSalvar)){

        e.preventDefault();
        e.returnValue = "";

    }

});

/* =====================================================
   FIREBASE
===================================================== */

onSnapshot(agendaRef,async function(snapshot){

    if(!snapshot.exists()){

        // Resposta vinda só do cache (sem confirmação do servidor): não é
        // seguro concluir que o documento não existe, e gravar uma agenda
        // vazia agora poderia apagar os dados reais.
        if(snapshot.metadata && snapshot.metadata.fromCache) return;

        // A TV nunca cria nem altera dados.
        if(modoTV){

            mostrarErroTela("Agenda não encontrada no banco de dados.");

            return;

        }

        console.warn("Documento 'agenda/principal' não existe. Criando um novo vazio.");

        await setDoc(agendaRef,{

            agenda:[],

            atualizadoEm:new Date().toISOString()

        });

        return;

    }

    mostrarErroTela("");

    const dados = snapshot.data();

    const agenda = dados.agenda || [];

    const json = JSON.stringify(agenda);

    if(json===ultimaVersao) return;

    ultimaVersao = json;

    desenharTabela(agenda);

},function(erro){

    console.error("Erro ao sincronizar com o Firestore:", erro);

    definirStatusSalvar("⚠ Sem conexão com o banco de dados", "erro");

    if(erro && erro.code === "permission-denied"){

        mostrarErroTela("Sem permissão para ler a agenda (verifique as regras de segurança do Firestore).");

    }else{

        mostrarErroTela("Sem conexão com o banco de dados. Tentando reconectar…");

    }

});

function chaveHora(item){

    const t = lerHora(item.horario);

    return t ? (t.h * 60 + t.min) : 9999;

}

function desenharTabela(lista){

    const hoje = hojeZero();

    // Guarda a posição original (o sort de navegadores antigos não é estável)
    lista.forEach(function(item,i){ item._i = i; });

    lista.sort(function(a,b){

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

        const dif = (inicioA ? inicioA.getTime() : 0) - (inicioB ? inicioB.getTime() : 0);

        if(dif !== 0) return dif;

        const difHora = chaveHora(a) - chaveHora(b);

        if(difHora !== 0) return difHora;

        return a._i - b._i;

    });

    tbody.innerHTML="";

    lista.forEach(function(item){ criarLinha(item); });

    destacarEventos();
    colorirLinhas();
    atualizarIndicadores();

    monitorarEventos();

}

function destacarEventos(){

    const hoje = hojeZero();

    tbody.querySelectorAll("tr").forEach(function(tr){

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

    linhas.forEach(function(tr){

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

    tbody.querySelectorAll("tr").forEach(function(tr){

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

            const aviso = parseInt(td[3].textContent.trim() || "15",10);

            proximo = {

                linha:tr,

                titulo:td[5].textContent.trim(),

                horario:td[2].textContent.trim(),

                aviso:isNaN(aviso) ? 15 : aviso,

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

    setTimeout(function(){

        alertaEvento.style.display="none";

    },15000);

}

function tocarSom(){

    const audio = new Audio("alerta.mp3");

    audio.volume = 1;

    const tentativa = audio.play();

    if(tentativa && tentativa.catch){

        tentativa.catch(function(){

            console.log("Som bloqueado pelo navegador.");

        });

    }

    setTimeout(function(){

        audio.pause();

        audio.currentTime = 0;

    },3000);

}

setInterval(monitorarEventos,5000);

function colorirLinhas(){

    const hoje = hojeZero();

    tbody.querySelectorAll("tr").forEach(function(tr){

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

        if(periodo.indexOf("manh") !== -1 || periodo.indexOf("matutino") !== -1)
            tr.classList.add("periodo-manha");

        if(periodo.indexOf("tarde") !== -1 || periodo.indexOf("vespertino") !== -1)
            tr.classList.add("periodo-tarde");

        if(periodo.indexOf("noite") !== -1 || periodo.indexOf("noturno") !== -1)
            tr.classList.add("periodo-noite");

        if(periodo.indexOf("integral") !== -1)
            tr.classList.add("periodo-integral");

        const fim = converterData(td[1].textContent);

        if(fim && fim < hoje){

            tr.classList.add("evento-passado");

        }

    });

}

/* =====================================================
   MODO TV: RECARREGAMENTO E ROLAGEM AUTOMÁTICA
===================================================== */

if (modoTV) {

    // Recarrega a página a cada 15 minutos
    setInterval(function(){

        location.replace(location.href);

    }, 15 * 60 * 1000);

    // "Paginação" automática: a cada 12 s rola a tabela uma tela para baixo
    // e volta ao início quando chega ao fim (a TV não tem mouse).
    setInterval(function(){

        const cont = document.querySelector(".table-container");

        if(!cont) return;

        const max = cont.scrollHeight - cont.clientHeight;

        if(max <= 4){

            cont.scrollTop = 0;

            return;

        }

        if(cont.scrollTop >= max - 4){

            cont.scrollTop = 0;

        }else{

            const passo = Math.max(cont.clientHeight - 100, 120);

            cont.scrollTop = Math.min(cont.scrollTop + passo, max);

        }

    }, 12000);

}

/* ===========================
   NOTÍCIAS G1 NO TICKER
=========================== */

const RSS_G1 = 'https://g1.globo.com/rss/g1/educacao/';
// troque por 'https://g1.globo.com/rss/g1/' se quiser notícias gerais

// Manchetes que contenham estas palavras não aparecem na TV.
// Edite a lista à vontade (deixe [] para não filtrar nada).
const PALAVRAS_BLOQUEADAS = ['grito', 'ameaça', 'assassin', 'estupro', 'tiroteio', 'morto', 'morre'];

function manchetePermitida(titulo){

    const t = titulo.toLowerCase();

    for(let i = 0; i < PALAVRAS_BLOQUEADAS.length; i++){

        if(t.indexOf(PALAVRAS_BLOQUEADAS[i]) !== -1) return false;

    }

    return true;

}

// Extrai os títulos de um XML de RSS (string)
function extrairManchetesDeXml(textoXml) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(textoXml, 'text/xml');

    if (xml.querySelector('parsererror')) {
        throw new Error('XML inválido/parsererror ao interpretar o RSS.');
    }

    const itens = xml.querySelectorAll('item');

    return Array.from(itens)
        .map(function(item){
            const t = item.querySelector('title');
            return t ? t.textContent.trim() : '';
        })
        .filter(Boolean)
        .filter(manchetePermitida)
        .slice(0, 8);
}

// Fonte 1: rss2json
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
        .map(function(item){ return (item.title || '').trim(); })
        .filter(Boolean)
        .filter(manchetePermitida)
        .slice(0, 8);
}

// Fonte 2 (fallback): allorigins
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

    for (let i = 0; i < fontes.length; i++) {
        const fonte = fontes[i];

        try {
            const manchetes = await fonte.buscar();

            if (manchetes.length) {
                document.getElementById('avisos').textContent =
                    manchetes.map(function(m){ return `📰 ${m}`; }).join('     •     ');

                console.log(`Notícias carregadas via ${fonte.nome} (${manchetes.length} itens).`);
                return; // sucesso — não tenta as próximas fontes
            }

            console.log(`Fonte ${fonte.nome} respondeu, mas sem manchetes.`);

        } catch (erro) {
            console.log(`Falha ao carregar notícias via ${fonte.nome}:`, (erro && erro.message) || erro);
            // tenta a próxima fonte da lista
        }
    }

    console.log('Não foi possível carregar notícias do G1 em nenhuma fonte. Mantendo texto atual do ticker.');
}

carregarNoticiasG1();
setInterval(carregarNoticiasG1, 10 * 60 * 1000); // atualiza a cada 10 minutos
