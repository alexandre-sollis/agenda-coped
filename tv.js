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

    // Para eventos de hoje: sem horário vem primeiro; depois por horário.
    function chaveHoraDia(item) {
        var h = lerHora(item.horario);
        return h ? h.h * 60 + h.min : -1;
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

            if (hojeA && hojeB) {
                // eventos de hoje: por horário (os de dia inteiro primeiro)
                var kA = chaveHoraDia(a), kB = chaveHoraDia(b);
                if (kA !== kB) return kA - kB;
                var dI = iA.getTime() - iB.getTime();
                if (dI !== 0) return dI;
                return a._i - b._i;
            }

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
        if (typeof ajustarEscala === "function") ajustarEscala();
        if (typeof montarCarrossel === "function") montarCarrossel();
        if (typeof montarInfinita === "function") montarInfinita();

        barraUnidade = "";   // força remontar o letreiro com as medidas novas
        atualizarBarra();
    }

    /* ---------- barra do próximo evento ----------
       O "próximo evento" é o primeiro da tabela que ainda não terminou:
       - com horário: a próxima ocorrência (hoje, se ainda não passou; senão
         o próximo dia do período);
       - sem horário (dia inteiro / só período): vale desde o início do dia e
         continua valendo durante todo o período do evento. */

    function dataMaisDias(d, dias) {
        return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dias);
    }

    function proximaOcorrencia(it, agora, hoje) {
        var dIni = converterData(it.inicio);
        if (!dIni) return null;
        var dFim = converterData(it.fim) || dIni;
        var hora = lerHora(it.horario);
        var base, quando;

        if (!hora) {
            // sem horário: se já começou, vale "hoje" enquanto o período durar
            if (dFim < hoje) return null;
            base = dIni > hoje ? dIni : hoje;
            return { quando: base, temHora: false };
        }

        base = dIni > hoje ? dIni : (dFim >= hoje ? hoje : null);
        if (!base) return null;

        quando = new Date(base.getTime());
        quando.setHours(hora.h, hora.min, 0, 0);

        if (quando < agora) {
            // já passou hoje: tenta o próximo dia do período
            var amanha = dataMaisDias(hoje, 1);
            if (dFim < amanha) return null;
            quando = new Date(amanha.getTime());
            quando.setHours(hora.h, hora.min, 0, 0);
        }

        return { quando: quando, temHora: true };
    }

    function dd_mm(d) {
        return (d.getDate() < 10 ? "0" : "") + d.getDate() + "/" +
            (d.getMonth() + 1 < 10 ? "0" : "") + (d.getMonth() + 1);
    }

    function atualizarBarra() {
        var agora = new Date();
        var hoje = hojeZero();
        var proximo = null;
        var proximaOc = null;
        var menor = Infinity;

        for (var i = 0; i < cache.length; i++) {
            var it = cache[i];

            if (it._tr) removeClass(it._tr, "evento-urgente");
            if (it._clones) {
                for (var k = 0; k < it._clones.length; k++) removeClass(it._clones[k], "evento-urgente");
            }

            var oc = proximaOcorrencia(it, agora, hoje);
            if (!oc) continue;

            var ms = oc.quando.getTime();
            if (ms < menor) {          // em empate, vale o primeiro da tabela
                menor = ms;
                proximo = it;
                proximaOc = oc;
            }
        }

        var novoTexto = "Nenhum evento programado.";

        if (proximo) {
            var partes = [proximo.acao];
            var ehHoje = proximaOc.quando.getTime() < dataMaisDias(hoje, 1).getTime();

            if (proximaOc.temHora) {
                if (!ehHoje) partes.push(dd_mm(proximaOc.quando));
                partes.push(proximo.horario);
            } else {
                partes.push(ehHoje ? "hoje" : dd_mm(proximaOc.quando));
            }
            novoTexto = partes.join(" • ");
        }

        definirTextoBarra(novoTexto);

        if (!proximo) return;

        if (proximaOc.temHora && (menor - agora.getTime()) <= 300000 && proximo._tr) {
            addClass(proximo._tr, "evento-urgente");
            if (proximo._clones) {
                for (var m = 0; m < proximo._clones.length; m++) addClass(proximo._clones[m], "evento-urgente");
            }
        }
    }

    /* ---------- letreiro da barra do próximo evento (em loop) ----------
       O texto passa da direita para a esquerda sem parar. Para a emenda ser
       perfeita, o texto é repetido (separado por " • ") e a faixa volta ao
       ponto inicial a cada "unidade" completa. Feito em JavaScript com
       transform, sem depender de animação CSS (TVs antigas podem não rodá-la). */

    var VELOCIDADE_BARRA_PX_S = 100;     // velocidade do letreiro (pixels por segundo)
    var LARGURA_MIN_BARRA = 360;         // largura mínima da barra (px)
    var SEPARADOR_BARRA = "\u00a0\u00a0\u2022\u00a0\u00a0";

    var barraUnidade = "";
    var barraPos = 0;
    var barraP = 0;
    var barraUlt = 0;
    var contBarra = document.getElementById("barraEvento");

    function montarBarra() {
        if (!contBarra) return;

        // 1) mede uma unidade (texto + separador) e a largura só do texto
        textoBarra.textContent = barraUnidade;
        var u = textoBarra.offsetWidth;
        textoBarra.textContent = barraUnidade + SEPARADOR_BARRA;
        barraP = textoBarra.offsetWidth;

        // 2) a barra tem a largura do texto (mínimo LARGURA_MIN_BARRA) e só
        //    encolhe se faltar espaço no cabeçalho
        contBarra.style.width = Math.max(u + 40, LARGURA_MIN_BARRA) + "px";
        var b = contBarra.clientWidth;

        // 3) repete a unidade até cobrir a barra + 1 unidade (sem buracos)
        var n = Math.max(Math.ceil(b / Math.max(barraP, 1)) + 1, 2);
        var s = "";
        for (var i = 0; i < n; i++) s += barraUnidade + SEPARADOR_BARRA;
        textoBarra.textContent = s;

        barraPos = -b;      // começa entrando pela direita
        barraUlt = 0;
    }

    function definirTextoBarra(texto) {
        if (texto === barraUnidade) return;
        barraUnidade = texto;
        montarBarra();
    }

    function quadroBarra() {
        if (barraP > 0) {
            var agora = new Date().getTime();
            var dt = barraUlt ? Math.min(agora - barraUlt, 250) : 0;
            barraUlt = agora;

            barraPos += VELOCIDADE_BARRA_PX_S * dt / 1000;
            if (barraPos >= barraP) barraPos -= barraP;

            var v = "translate3d(" + (-barraPos) + "px,0,0)";
            textoBarra.style.webkitTransform = v;
            textoBarra.style.transform = v;
        }
        raf(quadroBarra);
    }

    function iniciarBarra() {
        if (!contBarra) return;

        textoBarra.style.animation = "none";
        textoBarra.style.webkitAnimation = "none";
        textoBarra.style.whiteSpace = "nowrap";
        textoBarra.style.webkitFlex = "0 0 auto";
        textoBarra.style.flex = "0 0 auto";
        textoBarra.style.webkitBackfaceVisibility = "hidden";

        contBarra.style.webkitJustifyContent = "flex-start";
        contBarra.style.justifyContent = "flex-start";

        raf(quadroBarra);
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
    var LINHAS_MINIMAS = 3;           // pelo menos tantas linhas de evento visíveis na tela
    var ESCALA_MINIMA = 0.5;          // até quanto o layout pode encolher para isso (0.5 = metade)
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
        var larg = 0;
        var jan = 0;
        var medidoEm = 0;

        avisos.style.animation = "none";
        avisos.style.webkitAnimation = "none";
        avisos.style.paddingLeft = "0";
        avisos.style.webkitBackfaceVisibility = "hidden";
        avisos.textContent = "Bem-vindos à Agenda Institucional da DRE Cáceres.";

        function passo() {
            var agora = new Date().getTime();

            // mede no máximo 1 vez por segundo (medir a cada quadro deixa tudo lento)
            if (agora - medidoEm > 1000) {
                larg = avisos.offsetWidth;
                jan = janela.clientWidth;
                medidoEm = agora;
            }

            var dt = ultimo ? Math.min(agora - ultimo, 250) : 0;
            ultimo = agora;

            if (x === null) x = jan;
            x -= VELOCIDADE_TICKER_PX_S * dt / 1000;
            if (x < -larg) x = jan;

            var v = "translate3d(" + x + "px,0,0)";
            avisos.style.webkitTransform = v;
            avisos.style.transform = v;
            raf(passo);
        }

        raf(passo);
    }

    /* ---------- rolagem infinita ----------
       O cabeçalho da tabela fica parado e só as linhas rolam, sem parar.
       Para o ciclo ser perfeito, as linhas são duplicadas: quando a rolagem
       chega ao fim da primeira cópia, volta ao começo sem salto visível.
       O movimento é feito por transform (acelerado pela placa de vídeo),
       o que evita o "tremido" da rolagem comum em TVs antigas. */

    var infAtiva = false;
    var infPos = 0;
    var infPeriodo = 0;
    var infUltimo = 0;

    function alturaDisponivel(cont, thead) {
        var max = parseFloat(window.getComputedStyle(cont).maxHeight);
        if (isNaN(max)) max = window.innerHeight - 360;
        return max - 2 - (thead ? thead.offsetHeight : 0);
    }

    /* Mede as colunas a partir do conteúdo (como numa tabela normal) e fixa as
       larguras em pixels no cabeçalho e em todas as linhas. Assim as colunas
       ficam alinhadas e nenhum texto sai da célula. A coluna 6 ("Ações")
       fica com o que sobrar. */
    function aplicarLarguras(cont, thead) {
        var estilo = document.getElementById("larguraColunas");
        if (!estilo) {
            estilo = document.createElement("style");
            estilo.id = "larguraColunas";
            document.getElementsByTagName("head")[0].appendChild(estilo);
        }
        estilo.textContent = "";

        var m = document.createElement("table");
        m.style.cssText = "position:absolute;left:-99999px;top:0;visibility:hidden;" +
            "table-layout:auto;border-collapse:separate;border-spacing:0;width:" +
            Math.max(cont.clientWidth - 8, 300) + "px";
        m.appendChild(thead.cloneNode(true));

        var mb = document.createElement("tbody");
        var i, j;
        for (i = 0; i < tbody.rows.length; i++) mb.appendChild(tbody.rows[i].cloneNode(true));
        m.appendChild(mb);
        document.body.appendChild(m);

        var cels = m.rows[0].cells;
        var larguras = [];
        for (j = 0; j < cels.length; j++) larguras.push(cels[j].getBoundingClientRect().width);
        document.body.removeChild(m);

        var cols = [1, 2, 3, 5, 7];
        var regras = "";
        for (j = 0; j < cols.length; j++) {
            var w = larguras[cols[j] - 1];
            if (w > 0) {
                regras += "body.infinita #agenda th:nth-child(" + cols[j] + "), " +
                    "body.infinita #agenda td:nth-child(" + cols[j] + ") { width: " +
                    (Math.ceil(w * 100) / 100) + "px; }\n";
            }
        }
        estilo.textContent = regras;
    }

    function moverTbody(y) {
        var v = "translate3d(0," + (-y) + "px,0)";
        tbody.style.webkitTransform = v;
        tbody.style.transform = v;
    }

    function montarInfinita() {
        if (MODO_TABELA !== "infinita") return;

        var cont = document.querySelector(".table-container");
        var tabela = document.getElementById("agenda");
        var thead = cont ? cont.querySelector("thead") : null;
        if (!cont || !tabela) return;

        infAtiva = false;
        infPos = 0;
        infPeriodo = 0;
        infUltimo = 0;
        moverTbody(0);
        tabela.style.height = "auto";

        var n = tbody.rows.length;
        if (!n || !thead) return;

        aplicarLarguras(cont, thead);

        var disp = alturaDisponivel(cont, thead);
        var total = tbody.rows[n - 1].offsetTop + tbody.rows[n - 1].offsetHeight - tbody.rows[0].offsetTop;

        if (total <= disp + 2) return;   // tudo cabe na tela: não precisa rolar

        // Só a área abaixo do cabeçalho rola: o corpo da tabela é movido por
        // transform e o cabeçalho, opaco e por cima, esconde as linhas que
        // passam por baixo dele.
        tabela.style.height = (thead.offsetHeight + disp) + "px";

        var i, j;

        // Número ímpar de linhas: acrescenta uma linha em branco (separando o fim
        // do começo da lista) para o zebrado não inverter na emenda.
        if (n % 2 === 1) {
            var sep = document.createElement("tr");
            for (j = 0; j < 7; j++) {
                var td = document.createElement("td");
                td.textContent = "\u00a0";
                sep.appendChild(td);
            }
            tbody.appendChild(sep);
            n += 1;
        }

        var originais = [];
        for (i = 0; i < n; i++) originais.push(tbody.rows[i]);

        for (i = 0; i < cache.length; i++) cache[i]._clones = [];

        for (i = 0; i < n; i++) {
            var copia = originais[i].cloneNode(true);
            tbody.appendChild(copia);
            if (cache[i]) cache[i]._clones.push(copia);
        }

        infPeriodo = tbody.rows[n].offsetTop - tbody.rows[0].offsetTop;
        infAtiva = infPeriodo > 0;
    }

    function quadroInf() {
        if (infAtiva) {
            var agora = new Date().getTime();
            var dt = infUltimo ? Math.min(agora - infUltimo, 250) : 0;
            infUltimo = agora;

            infPos += VELOCIDADE_PX_S * dt / 1000;
            if (infPos >= infPeriodo) infPos -= infPeriodo;
            moverTbody(infPos);
        }
        raf(quadroInf);
    }

    /* ---------- pelo menos LINHAS_MINIMAS linhas visíveis ----------
       Se a tela for baixa, o cabeçalho, os cartões, as letras e os
       espaçamentos encolhem juntos, na proporção necessária, até que as
       linhas mais altas caibam na área da tabela (sem passar de ESCALA_MINIMA). */

    function px(v, f) {
        return (Math.round(v * f * 10) / 10) + "px";
    }

    function aplicarEscalaTV(f) {
        var est = document.getElementById("escalaTV");
        if (!est) {
            est = document.createElement("style");
            est.id = "escalaTV";
            document.getElementsByTagName("head")[0].appendChild(est);
        }

        if (f >= 0.999) {
            est.textContent = "";
            return;
        }

        var r = "";
        r += "body.tv header{min-height:" + px(90, f) + "}";
        r += "body.tv .logo{height:" + px(64, f) + "}";
        r += "body.tv .logo-area h1{font-size:" + px(34, f) + "}";
        r += "body.tv .logo-area p{font-size:" + px(16, f) + "}";
        r += "body.tv #barraEvento{height:" + px(50, f) + ";font-size:" + px(35, f) + "}";
        r += "body.tv .dashboard{padding:" + px(25, f) + " " + px(30, f) + "}";
        r += "body.tv .stat-card{padding:" + px(22, f) + " " + px(28, f) + "}";
        r += "body.tv .stat-card.card-gradient{padding:" + px(20, f) + "}";
        r += "body.tv .stat-label,body.tv .stat-label2{font-size:" + px(28, f) + "}";
        r += "body.tv .stat-value-lg{font-size:" + px(68, f) + "}";
        r += "body.tv .table-container{margin:0 " + px(30, f) + " " + px(20, f) + "}";
        r += "body.tv th{padding:" + px(18, f) + ";font-size:" + px(26, f) + "}";
        r += "body.tv td{padding:" + px(16, f) + ";font-size:" + px(36, f) + "}";
        r += "body.tv footer{height:" + px(55, f) + "}";
        r += "body.tv #avisos{font-size:" + px(30, f) + "}";
        r += "body.tv #erroTela{bottom:" + px(55, f) + ";font-size:" + px(26, f) + "}";
        est.textContent = r;
    }

    // A tabela ocupa todo o espaço entre os cartões e o rodapé.
    function ajustarAlturaContainer(cont) {
        var rodape = document.querySelector("footer");
        var topo = cont.getBoundingClientRect().top;
        var base = rodape ? rodape.getBoundingClientRect().top : window.innerHeight;
        var h = Math.max(base - topo - 16, 120);
        cont.style.maxHeight = h + "px";
    }

    function maiorSoma(alturas, k) {
        var melhor = 0;
        for (var i = 0; i + k <= alturas.length; i++) {
            var s = 0;
            for (var j = 0; j < k; j++) s += alturas[i + j];
            if (s > melhor) melhor = s;
        }
        return melhor;
    }

    function ajustarEscala() {
        var cont = document.querySelector(".table-container");
        var thead = cont ? cont.querySelector("thead") : null;
        if (!cont || !thead) return;

        var f = 1;
        var guarda = 0;

        while (guarda < 20) {
            guarda++;
            aplicarEscalaTV(f);
            ajustarAlturaContainer(cont);
            if (MODO_TABELA === "infinita") aplicarLarguras(cont, thead);

            var n = tbody.rows.length;
            if (!n) return;

            var alturas = [];
            var total = 0;
            for (var i = 0; i < n; i++) {
                var h = tbody.rows[i].offsetHeight;
                alturas.push(h);
                total += h;
            }

            var disp = alturaDisponivel(cont, thead);
            var minimas = Math.min(LINHAS_MINIMAS, n);

            if (total <= disp + 2 || maiorSoma(alturas, minimas) <= disp || f <= ESCALA_MINIMA) return;

            f = Math.round((f - 0.05) * 100) / 100;
            if (f < ESCALA_MINIMA) f = ESCALA_MINIMA;
        }
    }

    /* ---------- início ---------- */

    iniciarTicker();
    iniciarBarra();
    carregar();
    carregarNoticias();

    setInterval(carregar, INTERVALO_MS);
    setInterval(atualizarBarra, 5000);

    if (MODO_TABELA === "infinita") {
        raf(quadroInf);
        window.addEventListener("resize", function () { desenhar(cache); });
        if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
            document.fonts.ready.then(function () { if (cache.length) desenhar(cache); });
        }
    } else if (MODO_TABELA === "continua") {
        raf(quadro);
    } else if (MODO_TABELA === "carrossel") {
        setInterval(proximaPagina, TEMPO_PAGINA_MS);
        window.addEventListener("resize", function () { desenhar(cache); });
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
