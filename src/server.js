const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer);

const PORT = process.env.PORT || 5000;


console.log('Server Running!');

//* global variables
const games = {}; //hashmap of games| GameId : Array of connected socketIds
const users = {}; //hashmap of users| SocketID : Username
const gameData = {}; //hashmap of gameData| GameId : Variable containing all of a games given data
const { generateCombination } = require('gfycat-style-urls');

//* WebSocket events for each client (Events that the server can receive from the client)
io.on('connection', socket => {
    console.log("client connected");

    //^ runs on 'connection' event when client connects to server
    socket.on('new-user', username => {
        users[socket.id] = username //user chosen name added to array
        console.log(username + ' has joined with a socket id of ' + socket.id);
    })

    //^ when client sends request to create new game
    socket.on('create-new-game', () => { 
        console.log("creating new game");
        const gameId = generateGameId();  //create game with unique ID
        let clients = [];
        games[gameId] = clients; //empty client array in game hashmap created
        console.log("new game created with id " + gameId);

        io.to(socket.id).emit('game-created',{gameId: gameId}); //tell the client the new game's ID so they can share it with other users
    })

    //^ when client tries to join a game
    socket.on('join-game', gameIdToJoin => { 
        try{
            games[gameIdToJoin].push(socket.id); //attempt to add clients socketId to Game with gameId; try catch in case the game id the user is trying to join is invalid
            if(games[gameIdToJoin].length > 1){    //if 2 in game then players then start game
                console.log("Two users connected, game with id " + gameIdToJoin + " is now starting!");
                gameLogicStart(games[gameIdToJoin],gameIdToJoin); //pass all users in that game and the game id to the game logic function when the game starts
            }
        }catch(err){
            io.to(socket.id).emit('bad-join-code'); //if join code in valid, tell client to try again
        }
    })

    //^ event when client disconnects
    socket.on('disconnect', () => { 
        console.log('User ' + users[socket.id] + ' with socketid ' + socket.id + ' disconnects');
        for(var g in games){//find client arrays in games
            const index = games[g].indexOf(socket.id); // get the index in the game objects array of clients which contains the disconnecting clients data
            if (index > -1) { // only splice array when item is found
                games[g].splice(index, 1); // 2nd parameter means remove one item only

                games[g].forEach(player => { //for each client left in game object
                    io.to(player).emit('force-reload',{condition: 'disconnection'}); //reload the page, the game is over
                });
                delete gameData[g]; //delete the gameData object for the game that has just ended to save memory
                delete(games[g]); //as the user has left, delete the game from the games hashmap
              }
        }
        delete users[socket.id] //remove user entry from array
      })    

    //^ if a client creates a game then backs out delete the created game from the games list
    socket.on('cancel-game-creation', gameToCancel => { 
        delete games[gameToCancel];
      })

    //^ after the client has cut the deck
    socket.on('client-has-cut-deck', data => {
        if(games[data.gameId][0] === socket.id){ //if this action is triggered by the game's 'Player 0'
            gameData[data.gameId].hasP0cutDeck = true;
            gameData[data.gameId].p0deckCutResult = data.cardChosen; //store the result of the cut deck on server
        }else if(games[data.gameId][1] === socket.id){ //or by 'Player 1'
            gameData[data.gameId].hasP1cutDeck = true;
            gameData[data.gameId].p1deckCutResult = data.cardChosen; 
        }
        if(gameData[data.gameId].hasP0cutDeck && gameData[data.gameId].hasP1cutDeck){ //if both players have cut the deck
            //compare the two cards from each player's cut deck result, lower card is dealer, only first 2 chars needed
            var p0cutValue = gameData[data.gameId].p0deckCutResult.slice(0,2);
            var p1cutValue = gameData[data.gameId].p1deckCutResult.slice(0,2);
            if(p0cutValue === p1cutValue){//if the cards are equal, instead of re-cutting, choose random dealer
                console.log("cards are equal, choosing random dealer");
                var randomDealer = "";
                var random = Math.floor(Math.random() * 2); //random number between 0 and 1
                if(random === 0){
                    gameData[data.gameId].currentDealer = gameData[data.gameId].player0; //player 0 is the dealer
                    dealCardsToPlayers(data.gameId); //proceed to next logical stage of the game (dealing cards)
                    randomDealer = users[gameData[data.gameId].player0];
                }else if(random === 1){
                    gameData[data.gameId].currentDealer = gameData[data.gameId].player1; //player 1 is the dealer
                    dealCardsToPlayers(data.gameId); //proceed to next logical stage of the game (dealing cards)
                    randomDealer = users[gameData[data.gameId].player1];
                }
                //tell clients that dealer is being chosen at random
                io.to(gameData[data.gameId].player0).emit('dealer-chosen-randomly',{randomDealer: randomDealer});
            } 
            else if(p0cutValue < p1cutValue){
                gameData[data.gameId].currentDealer = gameData[data.gameId].player0; //player 0 is the dealer
                dealCardsToPlayers(data.gameId); //proceed to next logical stage of the game (dealing cards)
            }else if(p0cutValue > p1cutValue){ 
                gameData[data.gameId].currentDealer = gameData[data.gameId].player1; //player 1 is the dealer
                dealCardsToPlayers(data.gameId); //proceed to next logical stage of the game (dealing cards)
            }
          }
    })

    //^ when a client sends 2 cards to the crib
    socket.on('sendCardsToCrib', data => {
        console.log('crib received from ' + socket.id + ' with cards ' + data.cardsInCrib + ' in game ' + data.gameID);
        //who sent the cards to the crib?
        if(gameData[data.gameID].player0 === socket.id){ //if player 0 sent the cards to the crib
            gameData[data.gameID].p0crib = data.cardsInCrib; //store the cards in the crib in the gameData object
        }else if(gameData[data.gameID].player1 === socket.id){ //if player 1 sent the cards to the crib
            gameData[data.gameID].p1crib = data.cardsInCrib; //store the cards in the crib in the gameData object
        }
        //if both players have sent cards to the crib
        if(gameData[data.gameID].p0crib.length === 2 && gameData[data.gameID].p1crib.length === 2){
            //store the complete crib hand in the gameData object
            gameData[data.gameID].currentCrib = gameData[data.gameID].p0crib.concat(gameData[data.gameID].p1crib);

            //remove the cards in the crib from the players' hands so they aren't included in the scoring at the end of the round
            //remove the cards in p0crib from p0hand
            gameData[data.gameID].p0hand = gameData[data.gameID].p0hand.filter(card => !gameData[data.gameID].p0crib.includes(card));
            //remove the cards in p1crib from p1hand
            gameData[data.gameID].p1hand = gameData[data.gameID].p1hand.filter(card => !gameData[data.gameID].p1crib.includes(card));


            //next stage of game begins: Pone cuts the deck to get the starter card
            //find pone (player who is not the dealer)
            var pone = "";
            console.log(gameData[data.gameID].currentDealer);
            if(gameData[data.gameID].currentDealer === gameData[data.gameID].player0){
                //player 1 is pone, send them the deck to cut
                pone = gameData[data.gameID].player1;
            }else if(gameData[data.gameID].currentDealer === gameData[data.gameID].player1){
                //player 0 is pone, send them the deck to cut
                pone = gameData[data.gameID].player0;
            }
            //send the deck to cut to the pone
            io.to(pone).emit('cut-deck-start', {deckToCut : gameData[data.gameID].gamePlayDeck});
            console.log('sent deck to cut to ' + pone);
        }
    })

    //^ when a client has cut the deck to get the starter card
    socket.on('client-has-cut-deck-start', data => {
        //start card is the card chosen by the client
        gameData[data.gameId].cardPlayQueue.push(data.cardChosen); //add the card to the end of the cardPlayQueue to act as the starting card
        //if card is Jack, dealer gets 2 points (HIS HEELS)
        //check first 2 chars of card to see if it is a Jack (11)
        if(data.cardChosen.slice(0,2) === "11"){
            //if the dealer is player 0
            if(gameData[data.gameId].currentDealer === gameData[data.gameId].player0){
                gameData[data.gameId].p0score += 2; //add 2 points to player 0's score
                console.log('player 0 gets 2 points for  heels');
                updateScoreOnClients(data.gameId, gameData[data.gameId].player0, 2, ' their heels');
            }else if(gameData[data.gameId].currentDealer === gameData[data.gameId].player1){
                gameData[data.gameId].p1score += 2; //add 2 points to player 1's score
                console.log('player 1 gets 2 points for his heels');
                updateScoreOnClients(data.gameId, gameData[data.gameId].player1, 2, ' their heels');
            } 
        }
        console.log('starter card is ' + data.cardChosen);
        gameData[data.gameId].starterCard = data.cardChosen; //store the starter card in the gameData object
        //First Turn Start Setup
        //get pone (player who is not the dealer)
        var pone = "";
        if(gameData[data.gameId].currentDealer === gameData[data.gameId].player0){
            //player 1 is pone
            pone = gameData[data.gameId].player1;
        }else if(gameData[data.gameId].currentDealer === gameData[data.gameId].player1){
            //player 0 is pone
            pone = gameData[data.gameId].player0;
        }
        //ensure it is the pones turn to play
        gameData[data.gameId].currentTurn = pone;
        turnLogic(data.gameId); //^ start the first round
        //and tell the dealer the starter card
        io.to(gameData[data.gameId].currentDealer).emit('starter-card-for-dealer', {starterCard : data.cardChosen});
    })

    //* when a client has played a card during the round
    socket.on('play-card', data => {
        //log who last played a card in the gameData object
        gameData[data.gameId].whoLastPlayedCard = socket.id;
        //add the card to the cardPlayQueue in the gameData object
        gameData[data.gameId].cardPlayQueue.push(data.cardPlayed);
        //send the card played to the other client
        if(gameData[data.gameId].player0 === socket.id){ //if player 0 played the card
            io.to(gameData[data.gameId].player1).emit('card-played', {cardPlayed : data.cardPlayed});
            //and remove the card from player 0's hand
            //gameData[data.gameId].p0hand.splice(gameData[data.gameId].p0hand.indexOf(data.cardPlayed), 1);
        }else if(gameData[data.gameId].player1 === socket.id){ //if player 1 played the card
            io.to(gameData[data.gameId].player0).emit('card-played', {cardPlayed : data.cardPlayed});
            //and remove the card from player 1's hand
            //gameData[data.gameId].p1hand.splice(gameData[data.gameId].p1hand.indexOf(data.cardPlayed), 1);
        }

        //add the value of the card played to the current round count, ensure that Jack, Queen, King are 10
        if(data.cardPlayed.slice(0,2) === "11" || data.cardPlayed.slice(0,2) === "12" || data.cardPlayed.slice(0,2) === "13"){
            gameData[data.gameId].currentRoundCount += 10;
        }else{
            gameData[data.gameId].currentRoundCount += parseInt(data.cardPlayed.slice(0,2));
        }
        
        //if the card makes the count equal to 15
        if(gameData[data.gameId].currentRoundCount === 15){
            //player of card should get 2 points
            if(gameData[data.gameId].player0 === socket.id){ //if player 0 played the card
                gameData[data.gameId].p0score += 2; //add 2 points to player 0's score
                console.log('player 0 gets 2 points for 15');
                updateScoreOnClients(data.gameId,gameData[data.gameId].player0, 2, ' reaching 15'); 
            }else if(gameData[data.gameId].player1 === socket.id){ //if player 1 played the card
                gameData[data.gameId].p1score += 2; //add 2 points to player 1's score
                console.log('player 1 gets 2 points for 15');
                updateScoreOnClients(data.gameId,gameData[data.gameId].player1, 2, ' reaching 15'); 
            }
        }

        //^ check for pairs, 3 of a kind, 4 of a kind
        var cardPlayQueueWithoutStarter = gameData[data.gameId].cardPlayQueue.slice(1); //remove the starter card from the cardPlayQueue
        var matchingObject = matchingInPlay(cardPlayQueueWithoutStarter) //check for pairs, 3 of a kind, 4 of a kind
        console.log('matchingObject is ' + matchingObject);
        if(matchingObject === 2){ //if there are 2 matching cards
            //player of card should get 2 points
            if(gameData[data.gameId].player0 === socket.id){ //if player 0 played the card
                gameData[data.gameId].p0score += 2; //add 2 points to player 0's score
                console.log('player 0 gets 2 points for his pair');
                updateScoreOnClients(data.gameId,gameData[data.gameId].player0, 2, ' their pair');
            }else if(gameData[data.gameId].player1 === socket.id){ //if player 1 played the card
                gameData[data.gameId].p1score += 2; //add 2 points to player 1's score
                console.log('player 1 gets 2 points for his pair');
                updateScoreOnClients(data.gameId,gameData[data.gameId].player1, 2, ' their pair');
            }
        }else if(matchingObject === 3){ //if there are 3 matching cards
            //player of card should get 6 points
            if(gameData[data.gameId].player0 === socket.id){ //if player 0 played the card
                gameData[data.gameId].p0score += 6; //add 6 points to player 0's score
                console.log('player 0 gets 6 points for his 3 of a kind');
                updateScoreOnClients(data.gameId,gameData[data.gameId].player0, 6, ' 3 of a kind');
            }else if(gameData[data.gameId].player1 === socket.id){ //if player 1 played the card
                gameData[data.gameId].p1score += 6; //add 6 points to player 1's score
                console.log('player 1 gets 6 points for his 3 of a kind')
                updateScoreOnClients(data.gameId,gameData[data.gameId].player1, 6, ' 3 of a kind');
            }
        }else if(matchingObject >= 4){ //if there are 4 or more matching cards
            //player of card should get 12 points
            if(gameData[data.gameId].player0 === socket.id){ //if player 0 played the card
                gameData[data.gameId].p0score += 12; //add 12 points to player 0's score
                console.log('player 0 gets 12 points for his 4 of a kind');
                updateScoreOnClients(data.gameId,gameData[data.gameId].player0, 12, ' 4 of a kind');
            }else if(gameData[data.gameId].player1 === socket.id){ //if player 1 played the card
                gameData[data.gameId].p1score += 12; //add 12 points to player 1's score
                console.log('player 1 gets 12 points for his 4 of a kind');
                updateScoreOnClients(data.gameId,gameData[data.gameId].player1, 12, ' 4 of a kind');
            }
         }
    
        //^ check for runs (3 or more cards in a row)
        //only check for runs if there are 3 or more cards played
            if(gameData[data.gameId].cardPlayQueue.length >= 3){
                //ignoring the starter card (first card in queue)
                var cardsPlayed = gameData[data.gameId].cardPlayQueue.slice(1);
                var cardsPlayedOrderInverted = cardsPlayed.slice().reverse(); //reverse the order of the cards played

                let largestSubarray = findMaxSubarray(cardsPlayedOrderInverted); //find the largest subarray of cards played in order
                if(largestSubarray != null){ //if there is a subarray of cards played in order
                    let pointsScored = largestSubarray.length;
                    if(pointsScored >= 3){
                        //player of card should get points
                        if(gameData[data.gameId].player0 === socket.id){ //if player 0 played the card
                            gameData[data.gameId].p0score += pointsScored; //add points to player 0's score
                            console.log('player 0 gets ' + pointsScored + ' points for their run');
                            updateScoreOnClients(data.gameId,gameData[data.gameId].player0, pointsScored, ' their run');
                        }else if(gameData[data.gameId].player1 === socket.id){ //if player 1 played the card
                            gameData[data.gameId].p1score += pointsScored; //add points to player 1's score
                            console.log('player 1 gets ' + pointsScored + ' points for his run');
                            updateScoreOnClients(data.gameId,gameData[data.gameId].player1, pointsScored, ' their run');
                    }
                }
         }   
        }

        //^ swap the current turn to the other player (for next turn)
        //if the current turn is player 0
        if(gameData[data.gameId].currentTurn === gameData[data.gameId].player0){
            //set the current turn to player 1
            gameData[data.gameId].currentTurn = gameData[data.gameId].player1;
        }else if(gameData[data.gameId].currentTurn === gameData[data.gameId].player1){
            //set the current turn to player 0
            gameData[data.gameId].currentTurn = gameData[data.gameId].player0;
        }
        //check if the cardPlayQueue is at 9 cards (end of round - 8 cards played and starter card)
        if(gameData[data.gameId].cardPlayQueue.length === 9){
            endOfRound(data.gameId);
        }else{ //start next turn
            turnLogic(data.gameId);
        }
    });

    //^ when a client has said 'go' during the round
    socket.on('go', data => {
        //whoever played the last card in queue gets 1 point and the next player is whoever didn't play the last card
        if(gameData[data.gameId].whoLastPlayedCard === gameData[data.gameId].player0){ //if player 0 played the last card
            gameData[data.gameId].p0score += 1; //add 1 point to player 0's score
            console.log('player 0 gets 1 point for go')
            updateScoreOnClients(data.gameId,gameData[data.gameId].player0, 1, ' the go');
            gameData[data.gameId].currentTurn = gameData[data.gameId].player1; //set the current turn to player 1
        }else if(gameData[data.gameId].whoLastPlayedCard === gameData[data.gameId].player1){ //if player 1 played the last card
            gameData[data.gameId].p1score += 1; //add 1 point to player 1's score
            console.log('player 1 gets 1 point for go')
            updateScoreOnClients(data.gameId,gameData[data.gameId].player1, 1, ' the go');
            gameData[data.gameId].currentTurn = gameData[data.gameId].player0; //set the current turn to player 0
        }
        //round count resets to 0
        gameData[data.gameId].currentRoundCount = 0;
        //start next turn
        turnLogic(data.gameId);
    });

    //* clients confirm they have read the scores and wish to proceed to the next round
    socket.on('confirm-proceed', data => {
        //store who has confirmed
        var gameId = data.gameId;
        //if sent by player 0
        if(gameData[gameId].player0 === socket.id){
            gameData[gameId].p0confirmedProceed = true;
        }else if(gameData[gameId].player1 === socket.id){ //if sent by player 1
            gameData[gameId].p1confirmedProceed = true;
        }
        //check if both players have confirmed
        if(gameData[gameId].p0confirmedProceed && gameData[gameId].p1confirmedProceed){
          //next round can start
          readyForNextRound(gameId);
        }
    });
})

//*Uses gfycat style url generate for join game codes
function generateGameId(){
    const generatedId = generateCombination(2,".",false);
    return generatedId;
}

//*game logic start; where things are initialised and the deck cut process begins to decide to deals first
function gameLogicStart(gamePlayers, currentGameId){
    io.to(gamePlayers[0]).emit('game-start', {currentGameId : currentGameId}); //tell all connected clients game is starting
    io.to(gamePlayers[1]).emit('game-start', {currentGameId : currentGameId}); //cannot use broadcast as players in other games should not receive this emit

    //& gameData initialisation 
    gameData[currentGameId] = { //init the gameData value for the game with this ID in the gameData hashmap
        player0 : gamePlayers[0], //player 0 is the socketId for player 0, better for shorthand readability
        player1 : gamePlayers[1], //ditto for player 1
        currentDealer : undefined, //who is dealer currently
        hasP0cutDeck : false, //keep track of game flow at start phase
        hasP1cutDeck : false,
        p0cutDeckResult : undefined, //keep track of the result of the cut deck
        p1cutDeckResult : undefined,
        gamePlayDeck : undefined, //the deck of cards used for the game
        p0hand : [], //player 0's hand
        p1hand : [], //player 1's hand    
        p0crib : [], //player 0's crib submitted cards
        p1crib : [], //player 1's crib submitted cards
        currentCrib : undefined, //the crib currently being used
        cardPlayQueue : [], //the queue of cards that have been played, push to this (add to end) when a card is played
        p0score : 0, //player 0's score
        p1score : 0, //player 1's score
        currentRoundCount : 0, //the current round count
        currentTurn : undefined, //who's turn it is
        whoLastPlayedCard : undefined, //who played the last card
        matchingCards : [], //matching cards for the current round
        starterCard : undefined, //the starter card for the round
        p0confirmedProceed : false, //player 0 has confirmed they have read the scores and wish to proceed to the next round
        p1confirmedProceed : false //player 1 has confirmed they have read the scores and wish to proceed to the next round
    }

    var playDeck = shuffleDeck(createDeckOfCards()); //create a deck of cards and shuffle them

    //each player cuts the deck to decide who is the dealer
    io.to(gamePlayers[0]).emit('cut-deck', {deckToCut : playDeck, message : undefined});
    io.to(gamePlayers[1]).emit('cut-deck', {deckToCut : playDeck, message : undefined});
}

//*after dealer has been decided, this function deals the cards to each player
function dealCardsToPlayers(currentGameId){
    var gamePlayers = [gameData[currentGameId].player0, gameData[currentGameId].player1]; //get the players in the game
    gameData[currentGameId].gamePlayDeck = shuffleDeck(createDeckOfCards()); //shuffle the deck for the game

    //deal 6 cards to each player
    for(var i = 0; i < 6; i++){
        gameData[currentGameId].p0hand.push(gameData[currentGameId].gamePlayDeck.pop());
        gameData[currentGameId].p1hand.push(gameData[currentGameId].gamePlayDeck.pop());
    }    

    //tell each player their hand and the current dealer (for UI purposes)
    io.to(gamePlayers[0]).emit('your-hand', {yourHand : gameData[currentGameId].p0hand, currentDealer : gameData[currentGameId].currentDealer});
    io.to(gamePlayers[1]).emit('your-hand', {yourHand : gameData[currentGameId].p1hand, currentDealer : gameData[currentGameId].currentDealer});
}

//*function using nested loops to quickly create a full deck of cards without having to specify every individual card
function createDeckOfCards(){
    var suits = ['Hearts','Clubs','Diamonds','Spades'];
    var values = ['01','02','03','04','05','06','07','08','09','10','11','12','13'];
    //1 = ace, 11 = jack, 12 = queen, 13 = king; done this way to make it easier to compare cards, not reprented this way in UI
    var createdDeck = [];
    for(var suitCount = 0; suitCount < 4; suitCount++){
        for(var valCount = 0; valCount < 13; valCount++){
            createdDeck.push(values[valCount] + suits[suitCount]);
        }
    }
    return createdDeck;
}

//*function to shuffle a given deck of cards
function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

//* function to send the current score to all players in a game
function updateScoreOnClients(gameID, whoScored, scoreAmount, message){
    var scoreName = users[whoScored]; //get the name of the player who scored
    //send the current score to all players in the game
    io.to(gameData[gameID].player0).emit('update-score', {p0score : gameData[gameID].p0score, p1score : gameData[gameID].p1score, 
        p0socketId: gameData[gameID].player0, p1socketId: gameData[gameID].player1, whoScored : scoreName, scoreAmount : scoreAmount, message : message});
    io.to(gameData[gameID].player1).emit('update-score', {p0score : gameData[gameID].p0score, p1score : gameData[gameID].p1score, 
        p0socketId: gameData[gameID].player0, p1socketId: gameData[gameID].player1, whoScored : scoreName, scoreAmount : scoreAmount, message : message});
}

//* function to dictate who is playing, and comminicating to the clients who's turn it is
function turnLogic(gameID){
    var turn = gameData[gameID].currentTurn; //get who's turn it is
    //tell the player the current round count so they can 'go' when appropriate
    var currentRoundCount = gameData[gameID].currentRoundCount;
    //tell the player it is their turn so they can play a card
    io.to(turn).emit('your-turn', {currentRoundCount : currentRoundCount});
}

//* function to handle the logic when no more cards will be played
function endOfRound(gameID){
    //if the last card played was brings count to 31 then the player who played it gets 1 point, in addtion to last card point below
    if(gameData[gameID].currentRoundCount === 31){
        if(gameData[gameID].whoLastPlayedCard === gameData[gameID].player0){ //if player 0 played the card
            gameData[gameID].p0score += 2;
            console.log("player 0 gets 1 points for 31")
        }else{ //if player 1 played the card
            gameData[gameID].p1score += 2;
            console.log("player 1 gets 1 points for 31")
        }   
    }

    //and whoever plays the last card gets 1 point
    if(gameData[gameID].whoLastPlayedCard === gameData[gameID].player0){ //if player 0 played the card
        gameData[gameID].p0score += 1;
        console.log("player 0 gets 1 point for last card")
        updateScoreOnClients(gameID, gameData[gameID].player0, 1, " playing the last card");
    }else{ //if player 1 played the card
        gameData[gameID].p1score += 1;
        console.log("player 1 gets 1 point for last card")
        updateScoreOnClients(gameID, gameData[gameID].player1, 1, " playing the last card");
    }

    //hand scoring logic
    handScoring(gameID);
  }

  function readyForNextRound(gameID){
    //swap the dealer
    if(gameData[gameID].currentDealer === gameData[gameID].player0){ //if player 0 is the dealer then swap to player 1
        gameData[gameID].currentDealer = gameData[gameID].player1;
    }else if(gameData[gameID].currentDealer === gameData[gameID].player1){ //if player 1 is the dealer then swap to player 0
        gameData[gameID].currentDealer = gameData[gameID].player0;
    }
    //reset everything that needs to be so the next round can begin (if no one has reached 121 points)
    if(gameData[gameID].p0score < 121 && gameData[gameID].p1score < 121){
        gameData[gameID].hasP0cutDeck = false;
        gameData[gameID].hasP1cutDeck = false;
        gameData[gameID].p0cutDeckResult = undefined;
        gameData[gameID].p1cutDeckResult = undefined;
        gameData[gameID].gamePlayDeck = undefined;
        gameData[gameID].p0hand = [];
        gameData[gameID].p1hand = [];
        gameData[gameID].p0crib = [];
        gameData[gameID].p1crib = [];
        gameData[gameID].currentCrib = undefined;
        gameData[gameID].cardPlayQueue = [];
        gameData[gameID].currentRoundCount = 0;
        gameData[gameID].currentTurn = undefined;
        gameData[gameID].whoLastPlayedCard = undefined;
        gameData[gameID].matchingCards = [];
        gameData[gameID].starterCard = undefined;
        gameData[gameID].p0confirmedProceed = false;
        gameData[gameID].p1confirmedProceed = false;

        //deal the cards for the next round
        var playDeckNextRound = shuffleDeck(createDeckOfCards()); //create a deck of cards and shuffle them

        //tell the players there is a new round
        io.to(gameData[gameID].player0).emit('next-round', {deckToCut : playDeckNextRound, dealer: gameData[gameID].currentDealer}); //send the deck to cut to player 0, and tell them who the dealer is
        io.to(gameData[gameID].player1).emit('next-round', {deckToCut : playDeckNextRound, dealer: gameData[gameID].currentDealer}); //send the deck to cut to player 1, and tell them who the dealer is
        
        //new deck, shuffle, send to players (deal cards to players)
        var nextRoundDeck = shuffleDeck(createDeckOfCards()); //create a deck of cards and shuffle them for the next round
        gameData[gameID].gamePlayDeck = nextRoundDeck; //set the game play deck to the new deck
        dealCardsToPlayers(gameID);
        console.log("new round started");
    }else{
        console.log("GAME OVER");
    }
}

//* finding runs during play
function findMaxSubarray(cardsPlayed) {
    let cardValues = cardsPlayed.map(card => parseInt(card.substring(0, 2)));
    let len = 1;
    let start = 0;
    let end = 0;

    for (let i = 0; i < cardValues.length - 1; i++) {
      if (cardValues[i] !== cardValues[0]) continue;
      let min_val = cardValues[i], max_val = cardValues[i];
      for (let j = i + 1; j < cardValues.length; j++) {
        min_val = Math.min(min_val, cardValues[j]);
        max_val = Math.max(max_val, cardValues[j]);
        if (isConsecutive(cardValues, i, j, min_val, max_val)) {
          if (len < max_val - min_val + 1) {
            len = max_val - min_val + 1;
            start = i;
            end = j;
          }
        }
      }
    }
    let subarray = cardsPlayed.slice(start, end + 1);
    if (subarray[0] === cardsPlayed[0]) {
      return subarray;
    } else {
      return null;
    }
  }
  //^ helper function to find runs during play
  function isConsecutive(A, i, j, min, max) {
    if (max - min !== j - i) {
      return false;
    }
    let visited = new Array(j - i + 1).fill(false);
    for (let k = i; k <= j; k++) {
      if (visited[A[k] - min]) {
        return false;
      }
      visited[A[k] - min] = true;
    }
    return true;
  }


  //* score the hands at the end of the round
  function handScoring(gameID){
    console.log("hand scoring");

    //to communicate the score breakdown to the players, keep track of how many points each player gets for each scoring category

    //score hands, send scores to players. Clients keep track of who is dealer so order of score sending doesn't matter
    //score p0 hand
    var p0hand = gameData[gameID].p0hand; 
    //add starter card to end of hand
    p0hand.push(gameData[gameID].starterCard);
    //convert to scoring format
    var p0handConverted = convertCards(p0hand);
    //score hand
    var player0scoreObj = p0handConverted.split('\n').map((x) => new EndRoundScoringLogic(x).score);
    console.log("player 0 score: " + player0scoreObj[0].score);
    //add adwarded points to player scores
    gameData[gameID].p0score += player0scoreObj[0].score;
    updateScoreOnClients(gameID, gameData[gameID].player0, player0scoreObj[0].score, " their hand.");

    //score p1 hand 
    var p1hand = gameData[gameID].p1hand;
    //add starter card to end of hand
    p1hand.push(gameData[gameID].starterCard);
    //convert to scoring format
    var p1handConverted = convertCards(p1hand);
    //score hand
    var player1scoreObj = p1handConverted.split('\n').map((x) => new EndRoundScoringLogic(x).score);
    console.log("player 1 score: " + player1scoreObj[0].score);
    gameData[gameID].p1score += player1scoreObj[0].score;
    updateScoreOnClients(gameID, gameData[gameID].player1, player1scoreObj[0].score, " their hand.");

    //score crib
    var cribToScore = gameData[gameID].currentCrib;
    //add starter card to end of crib
    cribToScore.push(gameData[gameID].starterCard);
    //convert to scoring format
    var cribConverted = convertCards(cribToScore);
    //score crib
    var cribScoreObj = cribConverted.split('\n').map((x) => new EndRoundScoringLogic(x).score);
    //who is dealer? score crib for that player
    if(gameData[gameID].currentDealer == gameData[gameID].player0){ //player 0 is dealer
        console.log("player 0 score for crib: " + cribScoreObj[0].score);
        gameData[gameID].p0score += cribScoreObj[0].score;
        updateScoreOnClients(gameID, gameData[gameID].player0, cribScoreObj[0].score, " their crib.");
    }else if(gameData[gameID].currentDealer == gameData[gameID].player1){ //player 1 is dealer
        console.log("player 1 score for crib: " + cribScoreObj[0].score);
        gameData[gameID].p1score += cribScoreObj[0].score;
        updateScoreOnClients(gameID, gameData[gameID].player1, cribScoreObj[0].score, " their crib.");
  }
  //emit to clients the details of the scoring, acts as a pause/interval/trigger for the next round 
  io.to(gameData[gameID].player0).emit('end-of-round-scores',{ 
    player0id: gameData[gameID].player0, 
    player1id: gameData[gameID].player1, 
    player0handScoreBreakdown : player0scoreObj,
    player1handScoreBreakdown : player1scoreObj,
    cribScoreBreakdown : cribScoreObj,
  });
  io.to(gameData[gameID].player1).emit('end-of-round-scores',{ 
    player0id: gameData[gameID].player0, 
    player1id: gameData[gameID].player1, 
    player0handScoreBreakdown : player0scoreObj,
    player1handScoreBreakdown : player1scoreObj,
    cribScoreBreakdown : cribScoreObj,
  });
}

class EndRoundScoringLogic {

    constructor(hand){
      this.hand = hand;
      this.cardsToObjs(hand);
      this.calcCombos();
    }

    get score(){
      let r = {hand: this.hand, score: 0};
      ['fifteens', 'runs', 'pairs', 'flushes', 'nobs'].forEach((x) => {
        r[x] = this[x]();
        r.score += r[x];
      });
      return r;
    }
  
    cardsToObjs(cards){
      this.cards = cards.split(',').map((x,i)=>{
        x = x.replace(/10/,'X');
        this.faceUpSuit = x[1];
        return {
          suit: x[1],
          faceUp: i == 4,
          rank: ' A23456789XJQK'.split('').indexOf(x[0]),
          val: ('A23456789'.split('').indexOf(x[0]) + 1) || 10
        }
      }).sort((a,b) => a.rank - b.rank);
    }
  
    calcCombos(){
      this.combos = [[]];
      for(let card of this.cards){
        let old = this.combos.slice();
        for(let i of old){
          this.combos.push(i.concat(card));
        }
      }
    }
  
    fifteens(){
      return this.combos.map((x) => x.reduce((sum,x) => sum + x.val, 0))
        .filter((x) => x == 15).length * 2;
    }
  
    runs(){
      return this.combos.filter((x) => {
        return x.length > 2 && x.length == x.filter((c, i, ar) =>
          i == 0 || c.rank - 1 == ar[i - 1].rank).length;
      }).map((x) => x.length).sort().filter((x,i,ar) =>
        ar[ar.length-1] == x).reduce((s,x) => s + x, 0);
    }
  
    pairs(){
      let hash = {};
      this.cards.forEach((x) => hash[x.rank] = (hash[x.rank] || 0) + 1);
      return Object.values(hash).map((x) => [0, 0, 2, 6, 12][x])
        .reduce((sum, x) => sum + x, 0);
    }
  
    flushes(){
      let hash = {};
      this.cards.forEach((x) => hash[x.suit] = (hash[x.suit] || 0) + 1);
      hash[this.faceUpSuit] < 5 && hash[this.faceUpSuit]--;
      return Object.values(hash).filter((x) => x > 3)[0] || 0;
    }
  
    nobs(){
      return this.cards.reduce((sum, card) => 
        sum + (card.rank == 11 && card.suit == this.faceUpSuit), 0); 
    }
  
  }
  
  function convertCards(cards) {
    const ranks = {
      '01': 'A',
      '02': '2',
      '03': '3',
      '04': '4',
      '05': '5',
      '06': '6',
      '07': '7',
      '08': '8',
      '09': '9',
      '10': '10',
      '11': 'J',
      '12': 'Q',
      '13': 'K'
    };
    const suits = {
      'Hearts': 'H',
      'Diamonds': 'D',
      'Clubs': 'C',
      'Spades': 'S'
    };
  
    return cards.map(card => {
      const rank = ranks[card.substring(0, 2)];
      const suit = suits[card.substring(2)];
      return rank + suit;
    }).join(',');
  }
  
  //* used for checking for pairs, 3 of a kind, 4 of a kind - find matching values in cards at the end of the array (hand) and return them in an array
  function matchingInPlay(cards) {
    let currentSet = [cards[0]];
  
    for (let i = 1; i < cards.length; i++) {
      const currentValue = cards[i].substring(0, 2);
      const previousValue = currentSet[0].substring(0, 2);
  
      if (currentValue === previousValue) {
        currentSet.push(cards[i]);
      } else {
        currentSet = [cards[i]];
      }
    }
  
    if (currentSet.length > 1 && currentSet[currentSet.length - 1] === cards[cards.length - 1]) {
      return currentSet.length;
    } else {
      return 0;
    }
  }
  
  app.use(express.static("public"));

  httpServer.listen(PORT);
