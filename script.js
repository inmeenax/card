(() => {
  "use strict";

  // Variant-sensitive house rules are kept here in one place.
  const CONFIG = {
    rounds: 5, cardsPerPlayer: 13, minBid: 1, maxBid: 13, trumpSuit: "S",
    requireOvertake: true, requireTrumpWhenVoid: true, requireOvertrump: true,
    extraTrickPoints: 0.1, difficulty: "medium", animationDelay: 1450, trickCollectDelay: 1150
  };
  const SUITS = ["S", "H", "D", "C"];
  const RANKS = [2,3,4,5,6,7,8,9,10,11,12,13,14];
  const SUIT_SYMBOL = {S:"♠",H:"♥",D:"♦",C:"♣"};
  const SUIT_NAME = {S:"Spades",H:"Hearts",D:"Diamonds",C:"Clubs"};
  const NAMES = ["You","Neel","Kabir","Riya"];
  const SEATS = ["south","north","east","west"];
  // Anti-clockwise table order: South (You) → West (Riya) → North (Neel) → East (Kabir).
  const NEXT_PLAYER = [3, 2, 0, 1];
  const nextPlayer = playerIndex => NEXT_PLAYER[playerIndex];
  const $ = id => document.getElementById(id);
  const el = {
    welcome:$("welcomeScreen"), game:$("gameScreen"), start:$("startBtn"), newGame:$("newGameBtn"),
    roundBadge:$("roundBadge"), phase:$("phaseTitle"), status:$("statusText"), scoreRows:$("scoreRows"),
    tricksPlayed:$("tricksPlayed"), yourBid:$("yourBidLabel"), hand:$("hand"), handHelp:$("handHelp"),
    humanSub:$("humanSub"), turnPill:$("turnPill"), trickMessage:$("trickMessage"), centerCaption:$("centerCaption"),
    bidModal:$("bidModal"), bidRound:$("bidRound"), bidValue:$("bidValue"), bidMinus:$("bidMinus"), bidPlus:$("bidPlus"),
    bidHint:$("bidHint"), confirmBid:$("confirmBidBtn"), roundModal:$("roundModal"), roundTitle:$("roundTitle"),
    roundSummary:$("roundSummary"), roundResults:$("roundResults"), nextRound:$("nextRoundBtn"),
    matchModal:$("matchModal"), matchTitle:$("matchTitle"), matchSummary:$("matchSummary"),
    matchResults:$("matchResults"), playAgain:$("playAgainBtn"), rulesModal:$("rulesModal"),
    rulesBtn:$("rulesBtn"), closeRules:$("closeRulesBtn"), rulesDone:$("rulesDoneBtn"),
    soundBtn:$("soundBtn"), toast:$("toast")
  };
  let state = null, bidDraft = 3, busy = false, toastTimer = null, soundOn = false, audioCtx = null;
  let generation = 0;

  const rankName = r => ({11:"J",12:"Q",13:"K",14:"A"}[r] || String(r));
  const cardLabel = c => `${rankName(c.rank)}${SUIT_SYMBOL[c.suit]}`;
  const cardKey = c => `${c.suit}${c.rank}`;
  const compareRank = (a,b) => a.rank-b.rank;
  const sortHand = hand => hand.sort((a,b) => SUITS.indexOf(a.suit)-SUITS.indexOf(b.suit) || b.rank-a.rank);
  const makeDeck = () => SUITS.flatMap(suit => RANKS.map(rank => ({suit,rank})));
  function shuffle(deck) {
    for (let i=deck.length-1;i>0;i--) {
      const j=Math.floor(Math.random()*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]];
    }
    return deck;
  }
  function createPlayers() {
    return NAMES.map((name,id)=>({id,name,hand:[],bid:null,tricks:0,roundScore:0,totalScore:0,voidSuits:[]}));
  }
  function deal() {
    const deck=shuffle(makeDeck());
    const players=state.players;
    players.forEach(p=>{p.hand=[];p.bid=null;p.tricks=0;p.roundScore=0;p.voidSuits=[];});
    for(let i=0;i<deck.length;i++) players[i%4].hand.push(deck[i]);
    players.forEach(p=>sortHand(p.hand));
  }
  function startMatch() {
    generation++;
    state={round:1,phase:"dealing",players:createPlayers(),trick:[],trickNumber:0,leader:0,currentPlayer:0,history:[],matchFinished:false};
    busy=false; document.querySelector(".table-felt")?.classList.remove("collecting-trick"); hideAllModals(); el.welcome.classList.add("hidden"); el.game.classList.remove("hidden");
    startRound();
  }
  function startRound() {
    generation++;
    const token=generation;
    busy=true;
    state.phase="shuffling";state.trick=[];state.trickNumber=0;state.leader=0;state.currentPlayer=0;state.history=[];
    state.players.forEach(p=>{p.hand=[];p.bid=null;p.tricks=0;p.roundScore=0;p.voidSuits=[];});
    render();
    el.phase.textContent="Shuffling the deck";
    el.status.textContent="The deck is being shuffled before the cards are dealt.";
    el.trickMessage.textContent="Shuffling the deck…";
    window.setTimeout(()=>{
      if(token!==generation || !state)return;
      deal();
      state.phase="dealing";
      render();
      el.phase.textContent="Dealing the cards";
      el.status.textContent="13 cards are being dealt to each player.";
      el.trickMessage.textContent="Dealing 13 cards to each player";
      window.setTimeout(()=>{
        if(token!==generation || !state)return;
        state.phase="bidding";busy=false;render();openBidModal();
      }, 1250);
    }, 1100);
  }
  function scoreRound(bid,tricks) {
    if(tricks<bid)return -bid;
    if(tricks===bid)return bid;
    return Math.round((bid+(tricks-bid)*CONFIG.extraTrickPoints)*10)/10;
  }
  function evaluateBid(hand) {
    let strength=0, spades=hand.filter(c=>c.suit==="S").sort((a,b)=>b.rank-a.rank);
    strength += spades.length*0.23;
    spades.forEach((c,i)=>{if(c.rank===14)strength+=0.85;else if(c.rank===13)strength+=0.57;else if(c.rank===12)strength+=0.34;else if(c.rank===11)strength+=0.18; if(i<2 && c.rank>=10)strength+=0.12;});
    for(const suit of ["H","D","C"]){
      const cards=hand.filter(c=>c.suit===suit).sort(compareRank).reverse();
      if(cards.some(c=>c.rank===14))strength+=0.85;
      if(cards.some(c=>c.rank===13) && cards.length>=2)strength+=0.42;
      if(cards.some(c=>c.rank===12) && cards.length>=3)strength+=0.22;
      if(cards.length===0)strength+=0.55;
      if(cards.length===1)strength+=0.25;
    }
    const highNonTrump=hand.filter(c=>c.suit!=="S"&&c.rank>=12).length;
    strength += Math.max(0,highNonTrump-2)*0.12;
    return Math.max(1,Math.min(8,Math.round(strength)));
  }
  function openBidModal() {
    bidDraft=Math.max(1,Math.min(13,evaluateBid(state.players[0].hand)));
    el.bidRound.textContent=state.round;updateBidDisplay();el.bidModal.classList.add("bid-backdrop");el.bidModal.classList.remove("hidden");
    el.confirmBid.focus();
  }
  function updateBidDisplay() {
    el.bidValue.textContent=bidDraft;
    el.bidMinus.disabled=bidDraft<=CONFIG.minBid;el.bidPlus.disabled=bidDraft>=CONFIG.maxBid;
    const hand=state?.players?.[0]?.hand||[];
    const spades=hand.filter(c=>c.suit==="S").length;
    el.bidHint.textContent=`You hold ${spades} spade${spades===1?"":"s"} and ${hand.filter(c=>c.rank>=13).length} ace${hand.filter(c=>c.rank>=13).length===1?"":"s"}. Call what you can make.`;
  }
  function confirmBid() {
    if(!state||state.phase!=="bidding"||busy)return;
    state.players[0].bid=bidDraft;
    for(let i=1;i<4;i++)state.players[i].bid=evaluateBid(state.players[i].hand);
    state.phase="playing";state.currentPlayer=state.leader;el.bidModal.classList.remove("bid-backdrop");el.bidModal.classList.add("hidden");
    el.status.textContent="Your call is locked. Play a card when it is your turn.";
    playNextIfAI();render();
  }
  function getLegalCards(playerIndex, trick=state.trick) {
    const hand=state.players[playerIndex].hand;
    if(!trick.length)return [...hand];
    const ledSuit=trick[0].card.suit;
    const following=hand.filter(c=>c.suit===ledSuit);
    let legal=following.length?following:[...hand];
    if(following.length && CONFIG.requireOvertake) {
      const current=winningPlay(trick);
      if(current.card.suit===ledSuit) {
        const higher=following.filter(c=>c.rank>current.card.rank);
        if(higher.length)legal=higher;
      }
    } else if(!following.length && CONFIG.requireTrumpWhenVoid) {
      const trumps=hand.filter(c=>c.suit===CONFIG.trumpSuit);
      if(trumps.length) {
        legal=trumps;
        if(CONFIG.requireOvertrump) {
          const current=winningPlay(trick);
          if(current.card.suit===CONFIG.trumpSuit) {
            const higher=trumps.filter(c=>c.rank>current.card.rank);
            if(higher.length)legal=higher;
          }
        }
      }
    }
    return legal;
  }
  function beats(candidate, incumbent, ledSuit) {
    if(candidate.suit===CONFIG.trumpSuit && incumbent.suit!==CONFIG.trumpSuit)return true;
    if(incumbent.suit===CONFIG.trumpSuit && candidate.suit!==CONFIG.trumpSuit)return false;
    if(candidate.suit===incumbent.suit)return candidate.rank>incumbent.rank;
    if(candidate.suit===ledSuit && incumbent.suit!==ledSuit)return true;
    return false;
  }
  function winningPlay(trick) {
    if(!trick.length)return null;
    const ledSuit=trick[0].card.suit;
    let winner=trick[0];
    for(const play of trick.slice(1))if(beats(play.card,winner.card,ledSuit))winner=play;
    return winner;
  }
  function cardScoreForAI(card, legal, trick, playerIndex) {
    const me=state.players[playerIndex], led=trick[0]?.card.suit;
    const current=winningPlay(trick);
    const trial=[...trick,{player:playerIndex,card}];
    const winner=winningPlay(trial);
    const winsNow=winner?.player===playerIndex;
    const remainingNeeded=Math.max(0,(me.bid||0)-me.tricks);
    const hand=me.hand;
    const rankValue=card.rank/14;
    let score=0;
    const difficulty=CONFIG.difficulty;
    if(!trick.length){
      score += card.suit==="S" ? 2.5+card.rank/5 : (card.rank===14?2.8:card.rank===13?1.3:card.rank===12?0.45:0);
      const suitLen=hand.filter(c=>c.suit===card.suit).length;
      score += suitLen*0.18;
      if(remainingNeeded===0)score-=card.rank/7;
      else score+=card.rank/10;
      if(card.suit==="S"&&card.rank<11)score-=0.5;
    } else {
      if(winsNow){
        score += remainingNeeded>0?5.2: -2.4;
        score -= card.rank*0.19;
        if(current && current.card.suit==="S" && card.suit==="S")score-=0.7;
        const opponentsAfter=3-trick.length;
        if(opponentsAfter>0 && card.suit!==CONFIG.trumpSuit && !hand.some(c=>c.suit===CONFIG.trumpSuit))score-=0.3;
      }else{
        score += remainingNeeded>0?-1.0:1.5;
        score += (14-card.rank)*0.08;
      }
      if(card.suit===CONFIG.trumpSuit)score += (winsNow?-0.6:0.1);
      if(card.suit===led && card.rank===14)score+=0.25;
    }
    if(difficulty==="easy")score+=(Math.random()-.5)*2.2;
    if(difficulty==="hard"){
      // Small card-counting bonus: preserve high cards if a cheaper legal card also wins.
      if(trick.length && winsNow){
        const cheaperWinner=legal.some(c=>c.rank<card.rank && winningPlay([...trick,{player:playerIndex,card:c}])?.player===playerIndex);
        if(cheaperWinner)score-=1.5;
      }
      const seen=state.history.flatMap(t=>t.plays.map(p=>p.card));
      const unseenHigh=seen.length;
      score += unseenHigh*0.0005;
    }
    return score;
  }
  function chooseAICard(playerIndex) {
    const legal=getLegalCards(playerIndex);
    if(legal.length===1)return legal[0];
    let best=legal[0],bestScore=-Infinity;
    for(const c of legal){const score=cardScoreForAI(c,legal,state.trick,playerIndex);if(score>bestScore){bestScore=score;best=c;}}
    return best;
  }
  function playCard(playerIndex, card) {
    if(!state||state.phase!=="playing"||busy||playerIndex!==state.currentPlayer)return false;
    const player=state.players[playerIndex], legal=getLegalCards(playerIndex);
    if(state.trick.length>=4){showToast("This trick is already complete.");return false;}
    if(!legal.some(c=>cardKey(c)===cardKey(card))){showToast("That card is not legal for this trick.");return false;}
    const actual=player.hand.find(c=>cardKey(c)===cardKey(card));
    if(!actual)return false;
    player.hand.splice(player.hand.findIndex(c=>cardKey(c)===cardKey(card)),1);
    state.trick.push({player:playerIndex,card:actual});
    if(state.trick.length>4){showToast("Move ignored: trick is already full.");return false;}
    if(state.trick.length>1){
      const led=state.trick[0].card.suit;
      if(!player.hand.some(c=>c.suit===led))player.voidSuits=[...new Set([...player.voidSuits,led])];
    }
    playSound("card");
    render();
    if(state.trick.length===4){
      busy=true;state.phase="trick-result";const token=generation;
      const result=winningPlay(state.trick);
      el.trickMessage.textContent=`${state.players[result.player].name} wins the trick`;
      el.centerCaption.textContent="TRICK WINNER";
      window.setTimeout(()=>{
        if(token!==generation||!state)return;
        state.players[result.player].tricks++;
        state.history.push({plays:state.trick.map(p=>({player:p.player,card:{...p.card}})),winner:result.player});
        state.trickNumber++;
        if(state.trickNumber===13){finishRound();return;}
        document.querySelector(".table-felt")?.classList.remove("collecting-trick");
        state.leader=result.player;state.currentPlayer=result.player;state.trick=[];state.phase="playing";busy=false;
        el.trickMessage.textContent=`${state.players[result.player].name} leads next`;
        el.centerCaption.textContent="THE TRICK";render();playNextIfAI();
      },CONFIG.animationDelay);
    }else{
      state.currentPlayer=nextPlayer(state.currentPlayer);
      playNextIfAI();
    }
    return true;
  }
  function playNextIfAI() {
    if(!state||state.phase!=="playing"||busy)return;
    if(state.currentPlayer===0){render();return;}
    busy=true;render();
    const token=generation, playerIndex=state.currentPlayer;
    window.setTimeout(()=>{
      if(token!==generation||!state||state.phase!=="playing")return;
      busy=false;
      const card=chooseAICard(playerIndex);
      playCard(playerIndex,card);
    },CONFIG.animationDelay + Math.floor(Math.random()*350));
  }
  function finishRound() {
    busy=true;state.phase="round-result";
    state.players.forEach(p=>{p.roundScore=scoreRound(p.bid,p.tricks);p.totalScore=Math.round((p.totalScore+p.roundScore)*10)/10;});
    render();el.roundTitle.textContent=`Round ${state.round} results`;
    el.roundSummary.textContent="Calls compared with tricks won. Match totals carry into the next round.";
    el.roundResults.innerHTML=makeResultsTable(false);
    el.nextRound.textContent=state.round>=CONFIG.rounds?"View match results →":"Next round →";
    el.roundModal.classList.remove("hidden");playSound("win");
  }
  function nextRound() {
    if(!state||state.phase!=="round-result")return;
    el.roundModal.classList.add("hidden");busy=false;
    if(state.round>=CONFIG.rounds){finishMatch();return;}
    state.round++;startRound();
  }
  function finishMatch() {
    state.phase="match-result";state.matchFinished=true;render();
    const high=Math.max(...state.players.map(p=>p.totalScore));
    const winners=state.players.filter(p=>Math.abs(p.totalScore-high)<0.0001);
    el.matchTitle.textContent=winners.length===1?`${winners[0].name} wins!`:"It's a tie!";
    el.matchSummary.textContent=winners.length===1?`Congratulations to ${winners[0].name}. Final totals are below.`:`${winners.map(p=>p.name).join(" and ")} share the top score.`;
    el.matchResults.innerHTML=makeResultsTable(true);el.matchModal.classList.remove("hidden");
  }
  function makeResultsTable(final) {
    const rows=[...state.players].sort((a,b)=>b.totalScore-a.totalScore);
    return `<div class="result-line header"><span>PLAYER</span><span>CALL</span><span>TRICKS</span><span>${final?"TOTAL":"ROUND"}</span></div>`+
      rows.map(p=>`<div class="result-line"><span>${escapeHTML(p.name)}${p.id===0?" · You":""}</span><strong>${p.bid??"—"}</strong><strong>${p.tricks}</strong><strong class="gold">${formatScore(final?p.totalScore:p.roundScore)}</strong></div>`).join("");
  }
  function formatScore(n){return Number(n).toFixed(1);}
  function escapeHTML(s){return String(s).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));}
  function render() {
    if(!state)return;
    el.roundBadge.textContent=`Round ${state.round} / ${CONFIG.rounds}`;
    const deckAnimation=$("deckAnimation");
    if(deckAnimation){
      const showingDeck=state.phase==="shuffling"||state.phase==="dealing";
      deckAnimation.classList.toggle("hidden",!showingDeck);
      deckAnimation.classList.toggle("dealing",state.phase==="dealing");
      const caption=$("deckCaption");
      if(caption)caption.textContent=state.phase==="shuffling"?"SHUFFLING DECK":"DEALING CARDS";
    }
    const phaseTitles={shuffling:"Shuffling the deck",dealing:"Dealing the cards",bidding:"Make your call",playing:"Play your hand","trick-result":"Trick resolved","round-result":"Round complete","match-result":"Match complete"};
    el.phase.textContent=phaseTitles[state.phase]||"Call Break";
    el.tricksPlayed.textContent=`${state.trickNumber} / 13`;
    el.yourBid.textContent=state.players[0].bid??"Pending";
    el.scoreRows.innerHTML=state.players.map(p=>`<div class="score-row ${p.id===0?"you-row":""}"><span class="name">${escapeHTML(p.name)}</span><span class="total">${formatScore(p.totalScore)}</span><small>${p.bid===null?"Call pending":`Call ${p.bid} · ${p.tricks} trick${p.tricks===1?"":"s"}`}</small></div>`).join("");
    for(let i=0;i<4;i++){
      const p=state.players[i],seat=SEATS[i];
      const bidNode=$(`bid-${seat}`);
      if(bidNode)bidNode.textContent=p.bid===null?"CALL —":`CALL ${p.bid} · WON ${p.tricks}`;
      const backs=$(`backs-${seat}`);
      if(backs)backs.innerHTML=Array.from({length:p.hand.length},(_,n)=>`<span class="back-mini" style="--back-index:${n}"></span>`).join("");
      const seatEl=$(`seat-${seat}`);
      // The human sits at the bottom and has no opponent-seat panel; guard the missing element.
      if(seatEl){
        seatEl.classList.toggle("active-seat",state.phase==="playing"&&state.currentPlayer===i);
        seatEl.setAttribute("aria-label",`${p.name}, ${p.hand.length} cards remaining${p.bid===null?"":`, bid ${p.bid}`}`);
      }
    }
    for(const seat of SEATS){const node=$(`play-${seat}`);if(node){node.innerHTML="";node.className=`played-card slot-${seat}`;}}
    state.trick.forEach(play=>{
      const seat=SEATS[play.player],node=$(`play-${seat}`),c=play.card,red=c.suit==="H"||c.suit==="D";
      if(!node)return;
      node.className=`played-card slot-${seat}${red?" red":""}`;
      node.innerHTML=`<span>${rankName(c.rank)}</span><span class="card-suit">${SUIT_SYMBOL[c.suit]}</span><span class="card-bottom">${rankName(c.rank)}<span>${SUIT_SYMBOL[c.suit]}</span></span>`;
      node.setAttribute("aria-label",`${NAMES[play.player]} played ${cardLabel(c)}`);
    });
    const isHumanTurn=state.phase==="playing"&&state.currentPlayer===0&&!busy;
    el.turnPill.textContent=isHumanTurn?"YOUR TURN":state.phase==="playing"?"OPPONENT TURN":"WAIT";
    el.turnPill.classList.toggle("waiting",!isHumanTurn);
    const human=state.players[0];
    el.humanSub.textContent=human.bid===null?`Your hand · ${human.hand.length} cards`:`Bid ${human.bid} · Won ${human.tricks} · ${human.hand.length} cards left`;
    const legal=isHumanTurn?getLegalCards(0):[];
    el.hand.innerHTML=state.players[0].hand.map((c,index)=>{
      const isLegal=legal.some(l=>cardKey(l)===cardKey(c)),red=c.suit==="H"||c.suit==="D";
      const lockedInPlay=state.phase==="playing"&&!isLegal;
      const dealClass=state.phase==="dealing"?"deal-in":"";
      return `<button type="button" class="playing-card ${red?"red-card":""} ${isLegal?"legal":lockedInPlay?"disabled-card":""} ${dealClass}" style="--deal-index:${index}" data-card="${cardKey(c)}" aria-label="${rankName(c.rank)} of ${SUIT_NAME[c.suit]}${isLegal?", legal move":", not currently playable"}" ${isLegal?"":"disabled"}><span class="rank">${rankName(c.rank)}</span><span class="suit">${SUIT_SYMBOL[c.suit]}</span><span class="corner-bottom">${rankName(c.rank)}<br>${SUIT_SYMBOL[c.suit]}</span></button>`;
    }).join("");
    el.handHelp.textContent=isHumanTurn?(state.trick.length?"Play a legal card to follow the led suit.":"You lead this trick — choose any card."):(state.phase==="bidding"?"Your cards are dealt. Confirm your call to begin.":state.phase==="playing"?"Waiting for the table…":state.phase==="shuffling"?"Shuffling the deck…":state.phase==="dealing"?"Your cards are being dealt…":"");
    el.status.textContent=state.phase==="playing"?(isHumanTurn?"Your turn — legal cards are highlighted.":`${state.players[state.currentPlayer].name} is thinking…`):state.phase==="bidding"?"Choose how many tricks you expect to win.":state.phase==="round-result"?"Round scored. Review the results.":state.phase==="match-result"?"The five-round match is complete.":state.phase==="dealing"?"13 cards are being dealt to each player.":"The deck is being shuffled before the cards are dealt.";
    el.centerCaption.textContent=state.trick.length===4?"TRICK COMPLETE":"THE TRICK";
    if(state.trick.length<4&&state.trick.length>0)el.trickMessage.textContent=`${SUIT_SYMBOL[state.trick[0].card.suit]} led suit`;
    if(state.trick.length===0&&state.phase==="playing")el.trickMessage.textContent="Spades are trump";
  }
  function showToast(message) {
    el.toast.textContent=message;el.toast.classList.add("show");
    window.clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>el.toast.classList.remove("show"),2300);
  }
  function hideAllModals(){[el.bidModal,el.roundModal,el.matchModal,el.rulesModal].forEach(m=>m.classList.add("hidden"));}
  function openRules(){el.rulesModal.classList.remove("hidden");el.rulesDone.focus();}
  function closeRules(){el.rulesModal.classList.add("hidden");el.rulesBtn.focus();}
  function playSound(type) {
    if(!soundOn)return;
    try{
      audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();
      const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();
      osc.type="sine";osc.frequency.value=type==="win"?620:type==="deal"?330:440;
      gain.gain.setValueAtTime(.0001,audioCtx.currentTime);gain.gain.exponentialRampToValueAtTime(.045,audioCtx.currentTime+.012);gain.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+.12);
      osc.connect(gain);gain.connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+.13);
    }catch(_){/* Sound is optional; game remains fully playable. */}
  }
  function handleHandClick(event) {
    const button=event.target.closest("button[data-card]");
    if(!button||button.disabled||busy||!state||state.phase!=="playing"||state.currentPlayer!==0)return;
    const key=button.dataset.card;
    const card=state.players[0].hand.find(c=>cardKey(c)===key);
    if(card)playCard(0,card);
  }
  function runSelfChecks() {
    const deck=makeDeck();
    console.assert(deck.length===52,"Deck should contain 52 cards");
    console.assert(new Set(deck.map(cardKey)).size===52,"Deck cards should be unique");
    console.assert(scoreRound(3,3)===3,"Exact bid score");
    console.assert(scoreRound(3,5)===3.2,"Overbid score");
    console.assert(scoreRound(4,2)===-4,"Missed bid score");
    console.assert(scoreRound(1,0)===-1,"Zero trick score");
    const trick=[{player:0,card:{suit:"H",rank:14}},{player:1,card:{suit:"S",rank:2}},{player:2,card:{suit:"S",rank:14}},{player:3,card:{suit:"C",rank:14}}];
    console.assert(winningPlay(trick).player===2,"Highest trump should win");
  }
  el.start.addEventListener("click",startMatch);
  el.newGame.addEventListener("click",()=>{if(confirm("Start a new match? Your current match will be lost."))startMatch();});
  el.bidMinus.addEventListener("click",()=>{bidDraft=Math.max(CONFIG.minBid,bidDraft-1);updateBidDisplay();});
  el.bidPlus.addEventListener("click",()=>{bidDraft=Math.min(CONFIG.maxBid,bidDraft+1);updateBidDisplay();});
  el.confirmBid.addEventListener("click",confirmBid);
  el.hand.addEventListener("click",handleHandClick);
  el.nextRound.addEventListener("click",nextRound);
  el.playAgain.addEventListener("click",startMatch);
  el.rulesBtn.addEventListener("click",openRules);el.closeRules.addEventListener("click",closeRules);el.rulesDone.addEventListener("click",closeRules);
  el.soundBtn.addEventListener("click",()=>{soundOn=!soundOn;el.soundBtn.textContent=`Sound: ${soundOn?"On":"Off"}`;el.soundBtn.setAttribute("aria-pressed",String(soundOn));if(soundOn)playSound("card");});
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"&&!el.rulesModal.classList.contains("hidden"))closeRules();
    if(event.key==="Enter"&&!el.bidModal.classList.contains("hidden")&&document.activeElement!==el.bidMinus&&document.activeElement!==el.bidPlus)confirmBid();
  });
  runSelfChecks();
})();
