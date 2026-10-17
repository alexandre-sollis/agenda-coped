/* =====================================================
   tv.js — painel de TV (somente leitura)
   JavaScript antigo (ES5): sem módulos, sem SDK do Firebase.
   Lê o documento agenda/principal pela API REST do Firestore
   a cada 60 segundos. É carregado só quando o link tem ?tv=1.

   Obs.: a chave abaixo é a mesma do firebase.js. Chaves de app web
   do Firebase não são segredo; quem protege os dados são as regras
   do Firestore.
===================================================== */
(function () {
    "use strict";

    var PROJETO = "drecac-3daaf";
    var API_KEY = "AIzaSyBrPfO6hA9xQ3CaTXHjhbH_dmmYh4e_AOE";
    var URL_AGENDA = "https://firestore.googleapis.com/v1/projects/" + PROJETO +
        "/databases/(default)/documents/agenda/principal?key=" + API_KEY;

    var INTERVALO_MS = 60 * 1000;
    var RSS_G1 = "https://g1.globo.com/rss/g1/educacao/";
    var PALAVRAS_BLOQUEADAS = ["grito", "ameaça", "assassin", "estupro", "tiroteio", "morto", "morre"];

    document.body.className += " tv";

    var tbody = document.getElementById("tbody");
    var totalEventos = document.getElementById("totalEventos");
    var eventosHoje = document.getElementById("eventosHoje");
    var textoBarra = document.getElementById("textoBarra");
    var avisos = document.getElementById("avisos");

    var cache = [];
    var ultimoTexto = "";

    /* ---------- mensagem de erro visível ---------- */

    function mostrarErroTela(texto) {
        var el = document.getElementById("erroTela");
        if (!el) {
            el = document.createElement("div");
            el.id = "erroTela";
            document.body.appendChild(el);
        }
        el.textContent = texto || "";
        el.style.display = texto ? "block" : "none";
    }

    /* ---------- classes ---------- */

    function addClass(el, c) {
        if ((" " + el.className + " ").indexOf(" " + c + " ") === -1) {
            el.className = el.className ? el.className + " " + c : c;
        }
    }

    function removeClass(el, c) {
        el.className = (" " + el.className + " ").replace(" " + c + " ", " ").replace(/^\s+|\s+$/g, "");
    }

    /* ---------- datas e horas ---------- */

    function hojeZero() {
        var h = new Date();
        h.setHours(0, 0, 0, 0);
        return h;
    }

    function converterData(data) {
        if (!data) return null;
        var p = String(data).trim().split("/");
        var d, m, a;
        if (p.length === 2) {
            d = p[0]; m = p[1]; a = new Date().getFullYear();
        } else if (p.length === 3) {
            d = p[0]; m = p[1]; a = p[2];
        } else {
            return null;
        }
        d = parseInt(d, 10); m = parseInt(m, 10); a = parseInt(a, 10);
        if (isNaN(d) || isNaN(m) || isNaN(a)) return null;
        if (a < 100) a += 2000;
        return new Date(a, m - 1, d);
    }

    function lerHora(texto) {
        var m = String(texto || "").match(/(\d{1,2})\s*(?:[:hH]\s*(\d{2}))?/);
        if (!m) return null;
        return { h: parseInt(m[1], 10), min: m[2] ? parseInt(m[2], 10) : 0 };
    }

    function converterDataHora(data, hora) {
        var d = converterData(data);
        var t = lerHora(hora);
        if (!d || !t) return null;
        d.setHours(t.h, t.min, 0, 0);
        return d;
    }

    function chaveHora(item) {
        var t = lerHora(item.horario);
        return t ? t.h * 60 + t.min : 9999;
    }

    function formatarDataCurta(data) {
        if (!data) return "";
        var p = String(data).trim().split("/");
        if (p.length === 3 && parseInt(p[2], 10) === new Date().getFullYear()) {
            return p[0] + "/" + p[1];
        }
        return String(data).trim();
    }

    /* ---------- leitura do formato da API REST do Firestore ---------- */

    function valor(c) {
        if (!c) return "";
        if (c.stringValue !== undefined) return c.stringValue;
        if (c.integerValue !== undefined) return String(c.integerValue);
        if (c.doubleValue !== undefined) return String(c.doubleValue);
        return "";
    }

    function lerAgenda(doc) {
        var lista = [];
        var campo = doc && doc.fields && doc.fields.agenda;
        var valores = campo && campo.arrayValue && campo.arrayValue.values;
        if (!valores) return lista;
        for (var i = 0; i < valores.length; i++) {
            var f = valores[i].mapValue && valores[i].mapValue.fields;
            if (!f) continue;
            lista.push({
                inicio: valor(f.inicio),
                fim: valor(f.fim),
                horario: valor(f.horario),
                aviso: valor(f.aviso) || "15",
                periodo: valor(f.periodo),
                acao: valor(f.acao),
                responsavel: valor(f.responsavel),
                _i: i
            });
        }
        return lista;
    }

    /* ---------- ordenação (hoje, futuros, passados) ---------- */

    function ordenar(lista, hoje) {
        lista.sort(function (a, b) {
            var iA = converterData(a.inicio), fA = converterData(a.fim);
            var iB = converterData(b.inicio), fB = converterData(b.fim);

            var hojeA = iA && fA && hoje >= iA && hoje <= fA;
            var hojeB = iB && fB && hoje >= iB && hoje <= fB;
            if (hojeA && !hojeB) return -1;
            if (!hojeA && hojeB) return 1;

            var futA = iA && iA >= hoje;
            var futB = iB && iB >= hoje;
            if (futA && !futB) return -1;
            if (!futA && futB) return 1;

            var dif = (iA ? iA.getTime() : 0) - (iB ? iB.getTime() : 0);
            if (dif !== 0) return dif;

            var dh = chaveHora(a) - chaveHora(b);
            if (dh !== 0) return dh;

            return a._i - b._i;
        });
    }

    /* ---------- desenho da tabela ---------- */

    function desenhar(lista) {
        var hoje = hojeZero();
        var ativos = 0;
        var i, j;

        ordenar(lista, hoje);
        tbody.innerHTML = "";

        for (i = 0; i < lista.length; i++) {
            var it = lista[i];
            var tr = document.createElement("tr");
            var cel = [
                formatarDataCurta(it.inicio), formatarDataCurta(it.fim),
                it.horario, it.aviso, it.periodo, it.acao, it.responsavel
            ];

            for (j = 0; j < cel.length; j++) {
                var td = document.createElement("td");
                td.textContent = cel[j];
                tr.appendChild(td);
            }

            var ini = converterData(it.inicio);
            var fim = converterData(it.fim);

            if (ini && fim && hoje >= ini && hoje <= fim) {
                addClass(tr, "evento-hoje");
                ativos++;
            }

            var per = String(it.periodo).toLowerCase();
            if (per.indexOf("manh") !== -1 || per.indexOf("matutino") !== -1) addClass(tr, "periodo-manha");
            if (per.indexOf("tarde") !== -1 || per.indexOf("vespertino") !== -1) addClass(tr, "periodo-tarde");
            if (per.indexOf("noite") !== -1 || per.indexOf("noturno") !== -1) addClass(tr, "periodo-noite");
            if (per.indexOf("integral") !== -1) addClass(tr, "periodo-integral");

            if (fim && fim < hoje) addClass(tr, "evento-passado");

            it._tr = tr;
            tbody.appendChild(tr);
        }

        totalEventos.textContent = lista.length;
        eventosHoje.textContent = ativos;

        if (typeof reiniciarRolagem === "function") reiniciarRolagem();
        if (typeof montarCarrossel === "function") montarCarrossel();
        if (typeof montarInfinita === "function") montarInfinita();

        atualizarBarra();
    }

    /* ---------- barra do próximo evento ---------- */

    function atualizarBarra() {
        var agora = new Date();
        var proximo = null;
        var menor = Infinity;

        for (var i = 0; i < cache.length; i++) {
            var it = cache[i];

            if (it._tr) removeClass(it._tr, "evento-urgente");
            if (it._clones) {
                for (var k = 0; k < it._clones.length; k++) removeClass(it._clones[k], "evento-urgente");
            }

            var ini = converterDataHora(it.inicio, it.horario);
            if (!ini) continue;

            var dif = ini - agora;
            if (dif >= 0 && dif < menor) {
                menor = dif;
                proximo = it;
            }
        }

        if (!proximo) {
            textoBarra.textContent = "Nenhum evento programado.";
            return;
        }

        textoBarra.textContent = proximo.acao + " • " + proximo.horario;

        if (menor <= 300000 && proximo._tr) {
            addClass(proximo._tr, "evento-urgente");
            if (proximo._clones) {
                for (var m = 0; m < proximo._clones.length; m++) addClass(proximo._clones[m], "evento-urgente");
            }
        }
    }

    /* ---------- busca da agenda ---------- */

    function carregar() {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", URL_AGENDA, true);
        xhr.timeout = 20000;

        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;

            if (xhr.status === 200) {
                if (xhr.responseText === ultimoTexto) {
                    mostrarErroTela("");
                    return; // nada mudou: não redesenha (preserva a rolagem)
                }

                try {
                    var doc = JSON.parse(xhr.responseText);
                    cache = lerAgenda(doc);
                    ultimoTexto = xhr.responseText;
                    desenhar(cache);
                    mostrarErroTela("");
                } catch (e) {
                    mostrarErroTela("Erro ao ler a agenda: " + (e && e.message ? e.message : e));
                }
                return;
            }

            if (xhr.status === 403) {
                mostrarErroTela("Sem permissão para ler a agenda (verifique as regras do Firestore).");
            } else if (xhr.status === 404) {
                mostrarErroTela("Agenda não encontrada no banco de dados.");
            } else {
                mostrarErroTela("Sem conexão com o banco de dados (código " + xhr.status + "). Tentando novamente…");
            }
        };

        xhr.send();
    }

    /* ---------- notícias ---------- */

    function manchetePermitida(titulo) {
        var t = titulo.toLowerCase();
        for (var i = 0; i < PALAVRAS_BLOQUEADAS.length; i++) {
            if (t.indexOf(PALAVRAS_BLOQUEADAS[i]) !== -1) return false;
        }
        return true;
    }

    function carregarNoticias() {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", "https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent(RSS_G1), true);
        xhr.timeout = 20000;

        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4 || xhr.status !== 200) return;
            try {
                var d = JSON.parse(xhr.responseText);
                if (d.status !== "ok" || !d.items) return;

                var titulos = [];
                for (var i = 0; i < d.items.length && titulos.length < 8; i++) {
                    var t = String(d.items[i].title || "").trim();
                    if (t && manchetePermitida(t)) titulos.push(t);
                }
                if (titulos.length) avisos.textContent = titulos.join("     •     ");
            } catch (e) { /* mantém o texto atual do rodapé */ }
        };

        xhr.send();
    }

    /* ---------- rolagem automática (contínua e suave) ----------
       Modo escolhido em MODO_TABELA: "infinita" (rola sem parar, em ciclo),
       "carrossel" (páginas que trocam sozinhas), "continua" (desce e volta
       ao topo) ou "nenhuma".
       Começa na hora, sem pausa no topo. Ao chegar ao fim espera um
       instante (PAUSA_FIM_MS) e recomeça do topo. Se todas as linhas
       cabem na tela, não rola. Ajuste a velocidade abaixo. */

    var MODO_TABELA = "infinita";     // "infinita" | "carrossel" | "continua" | "nenhuma"
    if (MODO_TABELA === "infinita") document.body.className += " infinita";
    var TEMPO_PAGINA_MS = 10000;      // carrossel: tempo de cada página (10 s)
    var VELOCIDADE_PX_S = 20;   // pixels por segundo (maior = mais rápido)
    var PAUSA_FIM_MS = 1500;    // pausa ao chegar ao fim (0 = sem pausa)

    var pos = 0;
    var ultimoQuadro = 0;
    var pausaAte = 0;

    function raf(f) {
        var r = window.requestAnimationFrame || window.webkitRequestAnimationFrame;
        if (r) return r.call(window, f);
        return setTimeout(function () { f(new Date().getTime()); }, 16);
    }

    function reiniciarRolagem() {
        var cont = document.querySelector(".table-container");
        pos = 0;
        pausaAte = 0;
        ultimoQuadro = 0;
        if (cont && MODO_TABELA === "continua") cont.scrollTop = 0;
    }

    function quadro() {
        var cont = document.querySelector(".table-container");

        if (cont) {
            cont.style.scrollBehavior = "auto";

            var max = cont.scrollHeight - cont.clientHeight;
            var agora = new Date().getTime();
            var dt = ultimoQuadro ? Math.min(agora - ultimoQuadro, 250) : 0;
            ultimoQuadro = agora;

            if (max <= 4) {
                pos = 0;
                cont.scrollTop = 0;
            } else if (agora >= pausaAte) {
                if (pausaAte) {      // terminou a pausa do fim: volta ao topo
                    pausaAte = 0;
                    pos = 0;
                }
                pos += VELOCIDADE_PX_S * dt / 1000;
                if (pos >= max) {
                    pos = max;
                    pausaAte = agora + PAUSA_FIM_MS;
                }
                cont.scrollTop = pos;
            }
        }

        raf(quadro);
    }

    /* ---------- carrossel de páginas ----------
       Divide a tabela em páginas que cabem na tela e troca de página
       sozinho (com um fade rápido), com bolinhas indicando a página. */

    var ALTURA_DOTS = 36;
    var paginas = [];
    var paginaAtual = 0;
    var dotsEl = document.getElementById("paginationDots");

    function atualizarDots() {
        if (!dotsEl) return;
        dotsEl.innerHTML = "";
        if (paginas.length <= 1) {
            dotsEl.style.display = "none";
            return;
        }
        dotsEl.style.cssText = "display:block;text-align:center;padding:9px 0;line-height:1;";
        for (var i = 0; i < paginas.length; i++) {
            var d = document.createElement("span");
            d.style.cssText = "display:inline-block;width:14px;height:14px;margin:0 7px;border-radius:50%;background:" +
                (i === paginaAtual ? "#56d7ff" : "rgba(255,255,255,.28)");
            dotsEl.appendChild(d);
        }
    }

    function mostrarPagina(n) {
        paginaAtual = n;
        for (var p = 0; p < paginas.length; p++) {
            for (var r = 0; r < paginas[p].length; r++) {
                paginas[p][r].style.display = (p === n) ? "" : "none";
            }
        }
        atualizarDots();
    }

    function montarCarrossel() {
        if (MODO_TABELA !== "carrossel") return;

        var cont = document.querySelector(".table-container");
        if (!cont) return;

        var linhas = [];
        var i;
        for (i = 0; i < tbody.rows.length; i++) {
            tbody.rows[i].style.display = "";
            linhas.push(tbody.rows[i]);
        }

        if (dotsEl) dotsEl.style.display = "none";
        cont.style.overflowY = "hidden";
        paginas = [];
        paginaAtual = 0;

        if (!linhas.length || cont.scrollHeight <= cont.clientHeight + 2) {
            paginas = [linhas];       // tudo cabe: uma página só, sem trocar
            atualizarDots();
            return;
        }

        var thead = cont.querySelector("thead");
        var capacidade = cont.clientHeight - (thead ? thead.offsetHeight : 0) - ALTURA_DOTS;
        var atual = [];
        var soma = 0;

        for (i = 0; i < linhas.length; i++) {
            var h = linhas[i].offsetHeight;
            if (atual.length && soma + h > capacidade) {
                paginas.push(atual);
                atual = [];
                soma = 0;
            }
            atual.push(linhas[i]);
            soma += h;
        }
        if (atual.length) paginas.push(atual);

        mostrarPagina(0);
    }

    function proximaPagina() {
        if (MODO_TABELA !== "carrossel" || paginas.length <= 1) return;

        tbody.style.setProperty("transition", "opacity .35s", "important");
        tbody.style.opacity = "0";

        setTimeout(function () {
            mostrarPagina((paginaAtual + 1) % paginas.length);
            tbody.style.opacity = "1";
        }, 380);
    }

    /* ---------- faixa de notícias (ticker) em JavaScript ----------
       Não depende de animação CSS (TVs antigas podem não rodá-la). */

    var VELOCIDADE_TICKER_PX_S = 75;

    function iniciarTicker() {
        if (!avisos) return;

        var janela = avisos.parentNode;
        var x = null;
        var ultimo = 0;

        avisos.style.animation = "none";
        avisos.style.webkitAnimation = "none";
        avisos.style.paddingLeft = "0";
        avisos.style.position = "relative";
        avisos.textContent = "Bem-vindos à Agenda Institucional da DRE Cáceres.";

        function passo() {
            var larg = avisos.offsetWidth;
            var jan = janela.clientWidth;
            var agora = new Date().getTime();
            var dt = ultimo ? Math.min(agora - ultimo, 250) : 0;
            ultimo = agora;

            if (x === null) x = jan;
            x -= VELOCIDADE_TICKER_PX_S * dt / 1000;
            if (x < -larg) x = jan;

            avisos.style.left = Math.round(x) + "px";
            raf(passo);
        }

        raf(passo);
    }

    /* ---------- rolagem infinita ----------
       O cabeçalho da tabela fica parado e só as linhas rolam, sem parar.
       Para o ciclo ser perfeito, as linhas são duplicadas: quando a rolagem
       chega ao fim da primeira cópia, volta ao começo sem salto visível. */

    var infAtiva = false;
    var infPos = 0;
    var infPeriodo = 0;
    var infUltimo = 0;

    function alturaDisponivel(cont, thead) {
        var max = parseFloat(window.getComputedStyle(cont).maxHeight);
        if (isNaN(max)) max = window.innerHeight - 360;
        return max - 2 - (thead ? thead.offsetHeight : 0);
    }

    function montarInfinita() {
        if (MODO_TABELA !== "infinita") return;

        var cont = document.querySelector(".table-container");
        var thead = cont ? cont.querySelector("thead") : null;
        if (!cont) return;

        infAtiva = false;
        infPos = 0;
        infPeriodo = 0;
        infUltimo = 0;
        tbody.scrollTop = 0;
        tbody.style.height = "auto";

        var n = tbody.rows.length;
        if (!n) return;

        var disp = alturaDisponivel(cont, thead);
        var total = tbody.rows[n - 1].offsetTop + tbody.rows[n - 1].offsetHeight - tbody.rows[0].offsetTop;

        if (total <= disp + 2) return;   // tudo cabe na tela: não precisa rolar

        tbody.style.height = disp + "px";

        // Com número ímpar de linhas, o zebrado inverteria na emenda;
        // por isso usa-se um ciclo de 2 cópias nesse caso.
        var extra = (n % 2 === 0) ? 1 : 2;
        var originais = [];
        var i, c;
        for (i = 0; i < n; i++) originais.push(tbody.rows[i]);

        for (i = 0; i < cache.length; i++) cache[i]._clones = [];

        for (c = 0; c < extra; c++) {
            for (i = 0; i < n; i++) {
                var copia = originais[i].cloneNode(true);
                tbody.appendChild(copia);
                if (cache[i]) cache[i]._clones.push(copia);
            }
        }

        infPeriodo = tbody.rows[extra === 1 ? n : 2 * n].offsetTop - tbody.rows[0].offsetTop;
        infAtiva = infPeriodo > 0;
    }

    function quadroInf() {
        if (infAtiva) {
            var agora = new Date().getTime();
            var dt = infUltimo ? Math.min(agora - infUltimo, 250) : 0;
            infUltimo = agora;

            infPos += VELOCIDADE_PX_S * dt / 1000;
            if (infPos >= infPeriodo) infPos -= infPeriodo;
            tbody.scrollTop = infPos;
        }
        raf(quadroInf);
    }

    /* ---------- início ---------- */

    iniciarTicker();
    carregar();
    carregarNoticias();

    setInterval(carregar, INTERVALO_MS);
    setInterval(atualizarBarra, 5000);

    if (MODO_TABELA === "infinita") {
        raf(quadroInf);
        window.addEventListener("resize", function () { desenhar(cache); });
    } else if (MODO_TABELA === "continua") {
        raf(quadro);
    } else if (MODO_TABELA === "carrossel") {
        setInterval(proximaPagina, TEMPO_PAGINA_MS);
        window.addEventListener("resize", montarCarrossel);
    } else {
        // Sem rolagem automática: deixa a tabela rolável à mão (ex.: controle com ponteiro)
        var tabelaCont = document.querySelector(".table-container");
        if (tabelaCont) tabelaCont.style.overflowY = "auto";
    }

    setInterval(carregarNoticias, 10 * 60 * 1000);

    // Recarrega a página a cada 15 minutos (evita acúmulo de memória na TV)
    setInterval(function () {
        window.location.replace(window.location.href);
    }, 15 * 60 * 1000);
})();
