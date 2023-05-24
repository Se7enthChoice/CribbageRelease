//* global variables
var username = ""; //username declaration, global scope as it is local user's username
var currentGameId = ""; //easy access scope for current game's id
var amDealer = ""; //easy access scope for if user is dealer
var deckToCut = [];
var cutForStarter = false; //boolean to check if we are cutting for starter card or not
var ourScore = 0; //our score
var theirScore = 0; //their score

//socket io object declaration
const socket = io();

//* Start of the landing page and Create/Join game button functions
//^ called when user presses enter on username input
function verifyUsername(){ 
    username = document.getElementById("username-input").value;

    if (username === "") { //username pruning to make sure its not empty or too long
        console.log("No text input!");
      }else if(username.length > 15){
        alert("Username is too long!");
      }else{
        document.getElementById("landing-page").style.display = "none";
        document.getElementById("create-and-join").style.display = "block";
        socket.emit('new-user', username); //join game server with inputted username
      }
}

//^ called when create game button is pressed
function createGameButton(){
    document.getElementById("create-and-join").style.display = "none";
    document.getElementById("create-game").style.display = "block";
    socket.emit('create-new-game'); //send request to game server to create new game
}

//^ called when join game button is pressed
function joinGameButton(){
    document.getElementById("create-and-join").style.display = "none";
    document.getElementById("join-game").style.display = "block";
}

//^ called when return button is pressed
function returnButton(){
    document.getElementById("create-game").style.display = "none";
    document.getElementById("join-game").style.display = "none";
    document.getElementById("create-and-join").style.display = "block";
    document.getElementById("join-game-txt").value = "";
    socket.emit('cancel-game-creation', currentGameId);
    currentGameId = "";
}

//^ called when user submits a game ID to join
function joinGame(){
    var gameIdToJoin = document.getElementById("join-game-txt").value;
    socket.emit('join-game', gameIdToJoin);
}

//* start of socket.io event listeners
//^ if a game is successfully created, server returns ID for user to share
socket.on('game-created', data => {
    socket.emit('join-game', data.gameId); //automatically join created game
    currentGameId = data.gameId; //update client's record of the game they are in
    document.querySelector("#create-game p").innerText = "Share the following code with your friends so they can join your game: \n\n" + data.gameId; //query selector so as to not replace html for the return button
})

//^ if the user tries to join a game with an invalid code, alert them
socket.on('bad-join-code', data => {
    alert("A game with that join code does not exist!");
})

//^ when the server finds two players in a game, this is received from the server and the game begins
socket.on('game-start', data => {
    currentGameId = data.currentGameId;
    document.getElementById("landing-page").style.display = "none"; //hide earlier UI
    document.getElementById("create-game").style.display = "none";
    document.getElementById("join-game").style.display = "none";
    document.getElementById("grid-container").style.display = "grid"; //show main game UI
    updateGameLog("2 players joined, game starting");

    movePeg('ourPeg',91,0)
    movePeg('theirPeg',69,0)
})

//^ when the server can no longer continue with a game, the clients page is reloaded here
socket.on('force-reload', data => {
    if(data.condition === 'disconnection'){
        updateGameLog('A user has disconnected! The game is over.');
        setTimeout(reload, 5000);
    }else if(data.condition === 'game-won'){
        updateGameLog('A winner has been found! The game is over.');
        setTimeout(reload, 5000);
    }
  })
  //helper function to simplify above function
  function reload(){
    location.reload();
  }

 //^ server tells us that we should cut a deck, enable ui to allow user to do so
 socket.on('cut-deck', data => {
    document.getElementById("cut-deck-ui").style.display = "inline";
    deckToCut = data.deckToCut;
    addCutDeckEventListener(); //add event listener to cut-deck-ui
    //indicate current play for deck cut
    indicateElement("current-play");
    updateGameLog('Cut the deck to decide who is the dealer');
  })

//^ cut deck for starter card
socket.on('cut-deck-start', data => {
    console.log(data.deckToCut);
    //clear current play area
    document.getElementById("current-play").innerHTML = "";
    //use cut-deck-ui clone made earlier, child of grid-container
    var cutDeckImgClone = document.getElementById("grid-container").lastChild;
    deckToCut = data.deckToCut;
    //set cutdeckimgclone to be visible and child of current-play not grid-container
    cutDeckImgClone.style.display = "inline";
    document.getElementById("current-play").appendChild(cutDeckImgClone);
    cutForStarter = true;
    addCutDeckEventListener(); //add event listener to cut-deck-ui
    //indicate current play for deck cut
    indicateElement("current-play");
    //update game log
    updateGameLog('Cut the deck to choose the starting card');
})

//^ this function picks a card randomly from the deck, used for cutting deck
function pickRandomCard(deckToPickFrom){
    var randomCard = deckToPickFrom[Math.floor(Math.random() * deckToPickFrom.length)];
    return randomCard;
}

//^ when the cutting of the deck is done, send the result to the server via event listener on the cut-deck-ui click
function addCutDeckEventListener(){
        var cutDeckImg = document.getElementById("cut-deck-ui");
         cutDeckImg.addEventListener('click', () => {
        //deindicate the current play area, deck has been cut
        unindicateElement("current-play");
        //before removing cut-deck-ui, create a clone of it to add to the current play area later
        var cutDeckImgClone = cutDeckImg.cloneNode(true);
        //hide the clone and store it somewhere it won't get cleared (i.e. not inside the current play area)
        cutDeckImgClone.style.display = "none";
        document.getElementById("grid-container").appendChild(cutDeckImgClone);
        //remove cut-deck-ui from the UI
        document.getElementById("cut-deck-ui").style.display = "none";
        var randomCard = pickRandomCard(deckToCut);
        //display card chosen in cut in UI
        var currentPlay = document.getElementById("current-play");
        var randomCardUI = createCardUI(randomCard);
        randomCardUI.id = "cut-card-ui"; //id changed so that it can be removed later from outside this scope
        currentPlay.appendChild(randomCardUI); //add card to UI 
        //send card chosen to server
        if(cutForStarter){ //if we are cutting for starter card, send to server with different event name
            console.log('start game card cut is: ' + randomCard);
            socket.emit('client-has-cut-deck-start',{cardChosen : randomCard, gameId : currentGameId});
            //add custom class to the starter card we chose so we can style it differently
            document.getElementById("cut-card-ui").classList.add("start-card");
        }else{
        socket.emit('client-has-cut-deck',{cardChosen : randomCard, gameId : currentGameId});
        }
    });
}

//^ receive hand from server, update UI to show hand
socket.on('your-hand', data => {
    var hand = data.yourHand;
    hand.forEach(element => {
        console.log(element);
    });
    //if the socket id of the dealer matches our socket id, we are the dealer, so we receive the first card after the other player
    if (data.currentDealer === socket.id) {
        updateGameLog("You are the dealer! You will receive the first card after the other player.");
        //createUnseenCard() to create opponents unknown card
        //createCardUI() to create our known card
        for (var i = 0; i < hand.length; i++) {
          //deal opponent's card first
          setTimeout(placeOpponentCard, 3000 * i); //multiply i by delay time
          //then our card
          var cardToPass = createCardUI(hand[i], 'self');
          setTimeout(placeMyCard, 3000 * i + 1500 , cardToPass); //multiply i by delay time and add half of delay time
        }
        amDealer = true;
      } else { //we are the pone (other player), deal our card first
        updateGameLog("You are the pone! You will receive the first card.");
        for (var i = 0; i < hand.length; i++) {
          //then our card
          var cardToPass = createCardUI(hand[i], 'self');
          setTimeout(placeMyCard, 3000 * i, cardToPass); //multiply i by delay time
          //deal opponent's card first
          setTimeout(placeOpponentCard, 3000 * i + 1500); //multiply i by delay time and add half of delay time
        }
        amDealer = false;
      }
      //cards all drawn, now allow sending to crib
      setTimeout(sendToCribInit, 3000 * hand.length + 1500);
});

//^ when score changes server side, update UI to show new score
socket.on('update-score', data => {
    var friendlyScore = "Your Score: ";
    var opponentScore = "Opponent Score: ";
    if(data.p0socketId === socket.id){ //if we are player 0, update our score and opponent score accordingly in UI
        friendlyScore += data.p0score;
        opponentScore += data.p1score;
        document.getElementById("myScoreNumericDisplay").innerHTML = friendlyScore;
        document.getElementById("oppScoreNumericDisplay").innerHTML = opponentScore;
        ourScore = data.p0score;
        theirScore = data.p1score;
    }else if(data.p1socketId === socket.id){ //we are player 1 so update our score and opponent score accordingly in UI
        friendlyScore += data.p1score;
        opponentScore += data.p0score;
        document.getElementById("myScoreNumericDisplay").innerHTML = friendlyScore;
        document.getElementById("oppScoreNumericDisplay").innerHTML = opponentScore;
        ourScore = data.p1score;
        theirScore = data.p0score;
    }

    updateGameLog(data.whoScored + " scored " + data.scoreAmount + " points " + " for " + data.message); //update game log to show who scored and how many points

    updatePegs('ourPeg');
    updatePegs('theirPeg');


    //if the score is 121 or more, game is over
    if(data.p0score >= 121 || data.p1score >= 121){
        //if we are player 0 and our score is 121 or more, we win
        if(data.p0socketId === socket.id && data.p0score >= 121){
            updateGameLog("You win!");
            //if we are player 1 and our score is 121 or more, we win
        }else if(data.p1socketId === socket.id && data.p1score >= 121){
            updateGameLog("You win!");
        }else{ //otherwise we lost
            updateGameLog("You lost!");
        }
        //ensure the end round modal does not show
        document.getElementById("scoreModal").style.display = "none";
        //reload page after 15 seconds
        setTimeout(function(){ location.reload(); }, 30000);

    }
});

socket.on('dealer-chosen-randomly', data => {
    //game log to show who is dealer
    var randomDealer = data.randomDealer;
    updateGameLog("Cut deck was a tie, " + randomDealer + " is the randomly chosen dealer.");
});

//* function to create our card with value and suit visible
function placeMyCard(card){
    document.getElementById("hand").appendChild(card);
}

//* function to create opponents card with value and suit hidden (face down)
function placeOpponentCard(){
    document.getElementById("hand-opp").appendChild(createUnseenCard());
}

//* update game log function to show what is happening in the game in text form
function updateGameLog(message){
    const messageElement = document.createElement('div')
    messageElement.innerText = message
    document.getElementById("game-log").append(messageElement);

    var gameLogElement = document.getElementById("game-log");
    var observer = new MutationObserver(scrollToBottom);
    var config = {childList: true};
    observer.observe(gameLogElement, config);
    function scrollToBottom() {
        gameLogElement.scrollTop = gameLogElement.scrollHeight;
      }
    //add class to each message so that it can be styled
    messageElement.classList.add("game-log-message");
}

//* function to create cards as an html element so they can be displayed in the UI
function createCardUI(originalCard, whoPlayedCard){
    //extract suit and value from card
    var cardSuit;
    var cardValue;
    if(originalCard.includes("Hearts")){
        cardSuit = "hearts";
    }else if(originalCard.includes("Diamonds")){
        cardSuit = "diamonds";
    }else if(originalCard.includes("Spades")){
        cardSuit = "spades";
    }else if(originalCard.includes("Clubs")){
        cardSuit = "clubs";
    }

    //first two characters of card are the value, deal with face cards first
    if(originalCard.substring(0,2) === "01"){
        cardValue = "A";
    }else if(originalCard.substring(0,2) === "10"){ //substring problems as 10 is two characters
        cardValue = "10";
    }else if(originalCard.substring(0,2) === "11"){
        cardValue = "J";
    }else if(originalCard.substring(0,2) === "12"){
        cardValue = "Q";
    }else if(originalCard.substring(0,2) === "13"){
        cardValue = "K";
    }else{
        //if not a face card, the value is the second character of the card
        cardValue = originalCard.substring(1,2);
    }

    //card div contains all other elements
    var card = document.createElement('div');
    card.classList.add('card', cardSuit);
  
    //child of card div, contains the value
    var valueTop = document.createElement('div');
    valueTop.classList.add('value', 'top');
    valueTop.textContent = cardValue;
  
    //child of card div, contains the suit (and unicode character)
    var suitMiddle = document.createElement('div');
    suitMiddle.classList.add('suit');
    switch (cardSuit) {
        case 'hearts':
        suitMiddle.textContent = '\u2665';
        suitMiddle.classList.add('red');
        break;
        case 'diamonds':
        suitMiddle.textContent = '\u2666';
        suitMiddle.classList.add('red');
        break;
        case 'clubs':
        suitMiddle.textContent = '\u2663';
        break;
        case 'spades':
        suitMiddle.textContent = '\u2660';
        break;
    }
   
    //child of card div, contains the value, bottom of card
    var valueBottom = document.createElement('div');
    valueBottom.classList.add('value', 'bottom');
    valueBottom.textContent = cardValue;
  
    //store who the card belongs to by assigning the card a class of self or opp to be used in css styling
    if(whoPlayedCard === 'self'){
        card.classList.add('self');
    }else if(whoPlayedCard === 'opp'){
        card.classList.add('opp');
    }

    //append all elements to card div
    card.appendChild(valueTop);
    card.appendChild(suitMiddle);
    card.appendChild(valueBottom);
    return card;
}

//* function to create a card that is unseen by the player so it can be displayed in the UI
function createUnseenCard(){
    var unseenCard = document.createElement('div');
    unseenCard.classList.add('card');
    const backImage = document.createElement('img');
    backImage.classList.add('back');
    backImage.src = 'reverse-card-single.png';
    unseenCard.appendChild(backImage);
    unseenCard.setAttribute('dragable', 'false') //stop dragging of card image
    return unseenCard;
}

//* Player must choose 2 card to send to crib, setup event listeners for each card
function sendToCribInit(){
    updateGameLog("Choose two cards to send to the crib");
    //clear play area so we can show the cards that are being sent to crib
    document.getElementById("current-play").innerHTML = "";
    //get all cards in hand
    var cardsInHand = document.getElementById("hand").children;
    console.log(cardsInHand);
    //for each child element, add event listener to send card to crib
    for(let card of cardsInHand){
        card.addEventListener('click', sendThisCardToCrib); 
        //add event listeners to send card to crib when user clicks on card children as well (such as the suit or value)
        for(let child of card.children){
            child.addEventListener('click', sendThisCardToCribChild);
        }
    }
    //add indicated class to hand to show that cards can be sent to crib
    indicateElement("hand");
}

//* function to send card to crib and remove from hand when user clicks on card children (such as the suit or value)
function sendThisCardToCribChild(event){
    //get card that was clicked
    var cardClicked = event.target.parentNode; //get parent node of child that was clicked (the card itself)
    //trigger event listener on card itself instead of child
    cardClicked.click();
}

//* function to send card to crib and remove from hand
function sendThisCardToCrib(event){
    //get card that was clicked
    var cardClicked = event.target;
    //remove event listener from card
    cardClicked.removeEventListener('click', sendThisCardToCrib);
    //remove card from hand ui div
    cardClicked.parentNode.removeChild(cardClicked);
    //add card to crib (play area)
    document.getElementById("current-play").appendChild(cardClicked);
    //check if 2 cards have been sent to crib
    if(document.getElementById("current-play").children.length === 2){ //2 cards have been chosen to be sent to crib
        //stop event listeners on cards in hand
        var cardsInHand = document.getElementById("hand").children;
        for(let card of cardsInHand){
            card.removeEventListener('click', sendThisCardToCrib);
        }
        //create button to send cards back to hand, child of current-play div
        var sendCardsBackButton = document.createElement('button');
        sendCardsBackButton.classList.add('btn', 'btn-primary');
        sendCardsBackButton.textContent = "Send cards back to hand";
        document.getElementById("current-play").appendChild(sendCardsBackButton);
        //add event listener to button to send cards back to hand
        sendCardsBackButton.addEventListener('click', sendCardsBackToHand);
        //create button to send cards to crib, child of current-play div
        var sendCardsToCribButton = document.createElement('button');
        sendCardsToCribButton.classList.add('btn', 'btn-primary');
        sendCardsToCribButton.textContent = "Send cards to crib";
        document.getElementById("current-play").appendChild(sendCardsToCribButton);
        //add event listener to button to send cards to crib
        sendCardsToCribButton.addEventListener('click', sendCardsToCribConfirm);
        //add class to both buttons for styling
        sendCardsBackButton.classList.add('button-in-current-play');
        sendCardsToCribButton.classList.add('button-in-current-play');
    }
}

//* function to crib cards to server, called when send cards to crib button is clicked
function sendCardsToCribConfirm(){
    //unindicate hand
    unindicateElement("hand");
    //convert HTMLCollection of cards to array to send to server
    var cardsInCrib = document.getElementById("current-play").children;
    var cardsToSendToServer = [];
    //filter out buttons
    for(let card of cardsInCrib){
        if(card.classList.contains("card")){
            //extract card value and suit from card div and add to array
            var cardValue = card.children[0].textContent;
            var cardSuit = card.classList[1];
            //correct cards are into normal format before adding to array (Jdiamonds becomes 11Diamonds, 6hearts becomes 06Hearts, Aclubs becomes 01Clubs)
            if(cardValue === "J"){
                cardValue = "11";
            }else if(cardValue === "Q"){
                cardValue = "12";
            }else if(cardValue === "K"){
                cardValue = "13";
            }else if(cardValue === "A"){
                cardValue = "01";
            }else if(cardValue.length === 1){ //card value is 2-9 
                cardValue = "0" + cardValue;
            }
            //capitalise suit
            cardSuit = cardSuit.charAt(0).toUpperCase() + cardSuit.slice(1);
            //add card to array
            cardsToSendToServer.push(cardValue + cardSuit);
        }
    }
    //clear current-play div
    document.getElementById("current-play").innerHTML = "";
    //send to server
    socket.emit('sendCardsToCrib', {cardsInCrib : cardsToSendToServer, gameID : currentGameId});
    //tell user that pone is choosing starter card
    updateGameLog("Waiting for pone to choose starter card");
    //remove 2 cards from opponent's hand
    document.getElementById("hand-opp").children[0].remove();
    document.getElementById("hand-opp").children[0].remove();
    //show cards in crib display
    cribDisplay();
}

//* function to send cards back to hand
function sendCardsBackToHand(){
    //move cards in current-play div back to hand div
    var cardsInCrib = document.getElementById("current-play").children;
    while(cardsInCrib.length > 0){
        var card = cardsInCrib[0];
        console.log(card);
        if(card.classList.contains("card")){ //card is a card, not a button
            document.getElementById("hand").appendChild(card);
            console.log("appended" + card + "to hand");
        }else if(card.classList.contains("btn")){ //card is a button, remove it
            card.parentNode.removeChild(card);
            console.log("removed " + card + " button from current-play");
        }
    }
    //add event listeners back to cards in hand
    var cardsInHand = document.getElementById("hand").children;
    for(let card of cardsInHand){
        card.addEventListener('click', sendThisCardToCrib);
        //add event listeners to send card to crib when user clicks on card children as well (such as the suit or value)
        for(let child of card.children){
            child.addEventListener('click', sendThisCardToCribChild);
        }
    }
}

//* when the server tells us it is our turn in the round, we can play a card
socket.on('your-turn', data => {
    var currentCount = data.currentRoundCount;
    var canPlayCard = false; //assume we cannot play a card until we check
    updateGameLog("It is your turn to play a card");
    //for each card in hand(child of hand div), add event listener to play card
    //get all children of hand div
    var cardsInHandUI = document.getElementById("hand").children;

    //evaluate each card in hand to see if it can be played (i.e. would not go over 31)
    for(let card of cardsInHandUI){
        //get card value
        var cardValue = card.children[0].textContent;
        //if card value is a number, convert to number
        if(!isNaN(cardValue)){
            cardValue = parseInt(cardValue);
        }
        //if card value is a face card, convert to 10
        if(cardValue === "J" || cardValue === "Q" || cardValue === "K"){
            cardValue = 10;
        }
        //if card value is an ace, convert to 1
        if(cardValue === "A"){
            cardValue = 1;
        }

        if(cardValue + currentCount <= 31){ //card can be played
            //for each child element, add event listener to play card
            canPlayCard = true;
            card.addEventListener('click', playThisCard);
            //add event listeners to play card when user clicks on card children as well (such as the suit or value)
            for(let child of card.children){
                child.addEventListener('click', playThisCardChild);
            }
            //remove css class that indicates card cannot be played
            card.classList.remove('cannot-play-card');
        }else{
            //card cannot be played - add css to indicate this
            card.classList.add('cannot-play-card');
        }
    }

    //if no cards can be played, create go button
    if(!canPlayCard){
        //create go button
        var goButton = document.createElement('button');
        goButton.classList.add('btn', 'btn-primary');
        goButton.textContent = "Go";
        document.getElementById("current-play").appendChild(goButton);
        //add event listener to go button
        goButton.addEventListener('click', go);
        //set class for go button to indicate it is a go button
        goButton.classList.add('go-button');
        //add id to go button
        goButton.id = "go-button";
        //indicate go button
        indicateElement('go-button');
    }else{ //cards can be played
        //indicate hand
        indicateElement("hand");
    }
});

//* function to play card from event listener on card children (such as the suit or value)
function playThisCardChild(event){
    //get card that was clicked
    var cardClicked = event.target.parentNode; //get parent node of child that was clicked (the card itself)
    //trigger event listener on card itself instead of child
    cardClicked.click();
}

//* function to play card from event listener
function playThisCard(event){
    //unindicate hand
    unindicateElement("hand");
    updateGameLog("You played a card");
    //get card that was clicked
    var cardClicked = event.target;
    //remove event listener from card
    cardClicked.removeEventListener('click', playThisCard);
    //and remove event listener from all other cards in hand
    var cardsInHand = document.getElementById("hand").children;
    for(let card of cardsInHand){
        card.removeEventListener('click', playThisCard);
    }
    //remove card from hand ui div
    cardClicked.parentNode.removeChild(cardClicked);
    //add card to play area
    document.getElementById("current-play").appendChild(cardClicked);
    //send played card to server
    var cardPlayed = cardClicked.children[0].textContent + cardClicked.classList[1];
    //replace A with 01, J with 11, Q with 12, K with 13, while keeping suit the same
    console.log(cardPlayed);
    //if first character is A, J, Q, or K, replace with 01, 11, 12, or 13
    if(cardPlayed[0] === "A"){
        cardPlayed = cardPlayed.replace("A", "01");
    }else if(cardPlayed[0] === "J"){
        cardPlayed = cardPlayed.replace("J", "11");
    }else if(cardPlayed[0] === "Q"){
        cardPlayed = cardPlayed.replace("Q", "12");
    }else if(cardPlayed[0] === "K"){
        cardPlayed = cardPlayed.replace("K", "13");
    }else if(cardPlayed[0] >= "2" && cardPlayed[0] <= "9"){ //if first character is anywhere from 2-9, add a 0 to the start
        cardPlayed = "0" + cardPlayed;
    } 

    //capitalize suit
    cardPlayed = cardPlayed.replace(cardPlayed[2], cardPlayed[2].toUpperCase());
    console.log(cardPlayed);
    socket.emit('play-card', {cardPlayed : cardPlayed, gameId : currentGameId});
}

//* the dealer receives the starter card for the first round but cannot play
socket.on('starter-card-for-dealer', data => {
    //clear play area so we can show the cards that were last played
    document.getElementById("current-play").innerHTML = "";
    updateGameLog("Your opponent is playing a card");
    //display starter card
    console.log(data.starterCard);
    document.getElementById("current-play").appendChild(createCardUI(data.starterCard,'starterCard'));
    //add custom class to starter card so we can style it differently
    document.getElementById("current-play").lastChild.classList.add('start-card');
});

//* when the server tells us our opponent has played a card, we can display it
socket.on('card-played', data => {
    updateGameLog("Your opponent played a card");
    //add the card to the current-play div
    document.getElementById("current-play").appendChild(createCardUI(data.cardPlayed, 'opp'));
    //and ensure the card is visible
    document.getElementById("current-play").lastChild.style.display = "inline-block";
    //remove a card from the opponent's hand
    document.getElementById("hand-opp").removeChild(document.getElementById("hand-opp").lastChild);
});

//* when 'go' is clicked, send to server
function go(event){
    updateGameLog("You clicked 'go'");
    //unindicate go button
    unindicateElement('go-button');
    //delete go button
    var goButton = event.target;
    goButton.parentNode.removeChild(goButton);
    //send go to server
    socket.emit('go', {gameId : currentGameId});
}

//* when the server tells there is a new round
socket.on('next-round', data => {
    hideAllCribCards();
    //cutForStarter = true; 
    cutForStarter = true;
    updateGameLog("New round");
    //clear current-play div (cards played in previous round are no longer relevant)
    document.getElementById("current-play").innerHTML = "";

    //clear hands of both players
    document.getElementById("hand").innerHTML = "";
    document.getElementById("hand-opp").innerHTML = "";

    //are we dealer? 
    if(data.dealer === socket.id){
        amDealer = true;
    }else{
        amDealer = false;
    }
});

//* show the user how hands were scored for the round at round end
socket.on('end-of-round-scores', data => { //NOTE THAT THE OBJECT RETURNS THE AMOUNT OF POINTS SCORED FOR A SCORING CATEGORY, NOT THE NUMBER OF OCCURRENCES OF THAT CATEGORY
    console.log(data.player0id);
    console.log(data.player1id);
    console.log(data.player0handScoreBreakdown);
    console.log(data.player1handScoreBreakdown);
    console.log(data.cribScoreBreakdown);
    var p0name = "";
    var p1name = "";
    //are we player 0 or player 1?
    if(socket.id === data.player0id){
        //substite player 0's id for 'you' in the scores
        p0name = "You";
        p1name = "Your opponent";
    }else if(socket.id === data.player1id){
        //substite player 1's id for 'you' in the scores
        p0name = "Your opponent";
        p1name = "You";
    }

    //show modal popup which will contain the scores
    document.getElementById("scoreModal").style.display = "block";
    //show scores for player 0
    document.getElementById("p0ScoreDisplay").innerHTML =
    "<b>" + p0name + " scored: </b><br>" + 
    data.player0handScoreBreakdown[0].score + " points for their hand overall:<br>" +
    data.player0handScoreBreakdown[0].fifteens + " points for their hand's fifteens<br>" +
    data.player0handScoreBreakdown[0].pairs + " points for their hand's pairs<br>" +
    data.player0handScoreBreakdown[0].runs + " points for their hand's runs<br>" +
    data.player0handScoreBreakdown[0].flushes + " points for their hand's flushes<br>" +
    data.player0handScoreBreakdown[0].nobs + " points for their hand's nobs";
    //show scores for player 1
    document.getElementById("p1ScoreDisplay").innerHTML = "<b>" + p1name + " scored: </b><br>";
    document.getElementById("p1ScoreDisplay").innerHTML += data.player1handScoreBreakdown[0].score + " points for their hand overall:" + "<br>";
    document.getElementById("p1ScoreDisplay").innerHTML += data.player1handScoreBreakdown[0].fifteens + " points for their hand's fifteens" + "<br>";
    document.getElementById("p1ScoreDisplay").innerHTML += data.player1handScoreBreakdown[0].pairs + " points for their hand's pairs" + "<br>";
    document.getElementById("p1ScoreDisplay").innerHTML += data.player1handScoreBreakdown[0].runs + " points for their hand's runs" + "<br>";
    document.getElementById("p1ScoreDisplay").innerHTML += data.player1handScoreBreakdown[0].flushes + " points for their hand's flushes" + "<br>";
    document.getElementById("p1ScoreDisplay").innerHTML += data.player1handScoreBreakdown[0].nobs + " points for their hand's nobs" + "<br>";

    //show scores for crib
    document.getElementById("cribScoreDisplay").innerHTML = "<b>The dealer also scored:<b><br>";
    document.getElementById("cribScoreDisplay").innerHTML += data.cribScoreBreakdown[0].score + " points for the crib overall:" + "<br>";
    document.getElementById("cribScoreDisplay").innerHTML += data.cribScoreBreakdown[0].fifteens + " points for the crib's fifteens" + "<br>";
    document.getElementById("cribScoreDisplay").innerHTML += data.cribScoreBreakdown[0].pairs + " points for the crib's pairs" + "<br>";
    document.getElementById("cribScoreDisplay").innerHTML += data.cribScoreBreakdown[0].runs + " points for the crib's runs" + "<br>";
    document.getElementById("cribScoreDisplay").innerHTML += data.cribScoreBreakdown[0].flushes + " points for the crib's flushes" + "<br>";
    document.getElementById("cribScoreDisplay").innerHTML += data.cribScoreBreakdown[0].nobs + " points for the crib's nobs" + "<br>";

    // Get the modal element
    var modal = document.getElementById("scoreModal");

    // Get the button element
    var btn = document.getElementById("closeModalButton");

    //indicate the button
    indicateElement(btn.id);

    // When the user clicks the button, close the modal
    btn.onclick = function() {
     modal.style.display = "none";
     socket.emit('confirm-proceed', {gameId : currentGameId});
	  updateGameLog("Waiting for other player to proceed to next round!");
    }
});

function indicateElement(elementId){
    document.getElementById(elementId).classList.add("indicated");
}

function unindicateElement(elementId){
    document.getElementById(elementId).classList.remove("indicated");
}

//* adjust peg position according to the score
function updatePegs(pegIdArg){
    //current score is global
    var scoreToChangeOnBoard = ourScore;
    var pegId = pegIdArg;
    if(pegId === 'theirPeg'){ //if the peg is the opponent's peg, change the score to the opponent's score
        scoreToChangeOnBoard = theirScore;
    }
    //if score is between 0 and 45, move the peg to relevant place on score column 3
    //if score is between 46 and 89, move the peg to relevant place on score column 2
    //if score is between 90 and 121, move the peg to relevant place on score column 1

        if(scoreToChangeOnBoard >= 0 && scoreToChangeOnBoard <= 45){ //friendly x value percentage is 91, enemy x value percentage is 69
            //find percentage of score out of 45
            var percentageOfScore = scoreToChangeOnBoard / 45;
            //offset
            percentageOfScore -= 0.02;
            //the peg should be at that percentage of the height of the scoreboard
            if(pegId === 'ourPeg'){
                movePeg(pegId, 91, percentageOfScore * 100);
            }else if (pegId === 'theirPeg'){
                movePeg(pegId, 69, percentageOfScore * 100);
            }
        }else if(scoreToChangeOnBoard >= 46 && scoreToChangeOnBoard <= 89){ //friendly x value percentage is 58, enemy x value percentage is 36
            //find percentage of score out out of distance between 46 and 89
            var percentageOfScore = (scoreToChangeOnBoard - 46) / 43;
            //offset
            percentageOfScore -= 0.02;
            //the peg should be at that percentage of the height of the scoreboard
            if(pegId === 'ourPeg'){
            movePeg(pegId, 58, percentageOfScore * 100);
            }else if (pegId === 'theirPeg'){
                movePeg(pegId, 36, percentageOfScore * 100);
            }
        }else if(scoreToChangeOnBoard >= 90 && scoreToChangeOnBoard <= 121){ //friendly x value percentage is 25, enemy x value percentage is 3, board stops at 67%
            //find percentage of score out out of distance between 90 and 121
            var percentageOfScore = (scoreToChangeOnBoard - 90) / 31;
            //the percentage should be 0.66 of what it was as this board is shorter
            percentageOfScore = percentageOfScore * 0.66;
            //offset
            percentageOfScore -= 0.02;
            //the peg should be at that percentage of the height of the scoreboard
            if(pegId === 'ourPeg'){
                movePeg(pegId, 25, percentageOfScore * 100);
            }else if (pegId === 'theirPeg'){
                movePeg(pegId, 3, percentageOfScore * 100);
            }
        }else if(scoreToChangeOnBoard > 121){
            //move peg to end of 3rd column
            movePeg(pegId, 25, 66);
        }
}

//* sets peg position on the scoreboard
function movePeg(pegId, x, y){
    //move the peg in terms of the PERCENTAGE of the height and width of the scoreboard div
    document.getElementById(pegId).style.left = x + "%";
    document.getElementById(pegId).style.top = y + "%";
}

//* displays visual crib cards top left or bottom left depending on who is dealer
function cribDisplay(){
    if(amDealer === true){ //we have the crib, show 4 reverse cards in the 'score' div
        document.getElementById("cribRepMine").style.display = "block";
        //hide them in the other div
        document.getElementById("cribRepOpp").style.display = "none";
    }else if(amDealer === false){ //they have the crib, show 4 reverse cards in the 'score' div
        document.getElementById("cribRepOpp").style.display = "block";
        //hide them in the other div
        document.getElementById("cribRepMine").style.display = "none";
    }
}

//* hides crib cards top right, bottom right
function hideAllCribCards(){
    document.getElementById("cribRepMine").style.display = "none";
    document.getElementById("cribRepOpp").style.display = "none";
}
