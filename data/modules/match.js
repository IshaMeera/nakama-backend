// let roomCodes = {};

function matchInit(ctx, logger, nk, params) {
    return {
        state: {
            board: [
                ["", "", ""],
                ["", "", ""],
                ["", "", ""]
            ],
            players: [],
            turn: null,
            winner: null,
            turnStartTime: Date.now(),
            botEnabled: false,
            botSymbol: "O",
            winReason: null,
            waitingForPlayer: false,
            waitStart: null,
        },
        tickRate: 1,
        label: "tic-tac-toe",
    };
}

function matchJoin(ctx, logger, nk, dispatcher, tick, state, presences) {
    if(!state.players){
        logger.warn("Players array missing reinitialising");
        state.players = [];
    }
    presences.forEach(p => {
        const player = state.players.find(pl => pl.userId === p.userId);

        if(!player){
            if(state.players.length >= 2){
                logger.info("Match already full");
                return;
            }
            // const symbol = state.players.length === 0 ? "X" : "O";
            state.players.push({
                userId: p.userId,
                symbol: null
            })
            logger.info(`Player joined: ${p.userId}`);
        }else{
            logger.info(`Player rejoined: ${p.userId}`)
        }

       if (state.players.length === 1) {
            state.waitingForPlayer = true;
            state.waitStart = Date.now() - state.turnStartTime > 800;

            logger.info("Waiting for second player...");
        }
        if(state.players.length === 2){
            //real match
            state.botEnabled = false;
            state.waitingForPlayer = false;

            const [p1, p2] = state.players;
            if(Math.random() < 0.5){
                p1.symbol = "X";
                p2.symbol = "O";
            }else{
                p1.symbol = "O";
                p2.symbol = "X";
            }
            state.turn = Math.random() < 0.5 ? "X" : "O";

            logger.info("2-player match started");
        }
    });

    dispatcher.broadcastMessage(1, JSON.stringify(state));

    return { state };
}

function checkWinner(board) {
    const lines = [
        [[0,0],[0,1],[0,2]],
        [[1,0],[1,1],[1,2]],
        [[2,0],[2,1],[2,2]],
        [[0,0],[1,0],[2,0]],
        [[0,1],[1,1],[2,1]],
        [[0,2],[1,2],[2,2]],
        [[0,0],[1,1],[2,2]],
        [[0,2],[1,1],[2,0]],
    ];

    for (let line of lines) {
        const [a, b, c] = line;
        if (
            board[a[0]][a[1]] &&
            board[a[0]][a[1]] === board[b[0]][b[1]] &&
            board[a[0]][a[1]] === board[c[0]][c[1]]
        ) {
            return{
            winner: board[a[0]][a[1]],
            line
            }
        }
    }

    return null;
}

function findWinningMove(board, symbol){
    for(let i=0; i<3; i++){
        for(let j=0; j<3; j++){
            if(board[i][j] === ""){
                board[i][j] = symbol;

                if(checkWinner(board)){
                    board[i][j] = "";
                    return[i, j];
                }
                board[i][j] = "";
            }
        }
    }
    return null;
}

//receice move->validate->placemove->check winner-> broadcast
function matchLoop(ctx, logger, nk, dispatcher, tick, state, messages) {
    let updated = false;
    messages.forEach(msg => {
        let data = JSON.parse(nk.binaryToString(msg.data));
        let { x, y } = data;

        logger.info("Incoming move:" + JSON.stringify(data));
        logger.info("Current move:" + state.turn)

        if(state.winner){
            logger.info("Game already finished");
            return;
        };

        if(x < 0 || x > 2 || y < 0 || y > 2){
            logger.info("Invalid coordinates")
            return
        };

        //find player
        let player = state.players.find(p=> p.userId === msg.sender.userId);

        if(!player){
            logger.info("Invalid player");
            return
        }

        if(player.symbol !== state.turn){
            logger.info("Not this player turn");
            return;
        }

        if (state.board[x][y] !== "") {
            logger.info("Cell already filled");
            return;
        };

        //place move
        state.board[x][y] = state.turn;
        logger.info("Move placed at:" + x + "," + y);

        //check winner after move
        let result = checkWinner(state.board);
        if(result){
            state.winner = result.winner;
            state.winningLine = result.line;
            logger.info("Winner is:" + state.winner);
        }
        //not winner switch turn
        state.turn = state.turn === "X" ? "O" : "X";
        state.turnStartTime = Date.now();

        let isDraw = state.board.every(row => row.every(cell => cell !== ""));
        if(isDraw && !state.winner){
            state.winner = "Draw";
            logger.info("Game ended in a draw");
        }
        updated = true;
        logger.info("Move received board now:" + JSON.stringify(state.board));
    });

    //broadcast to all clients oly if something changes
    if(updated){
    dispatcher.broadcastMessage(1, JSON.stringify(state));
    }

    if(
        state.players.length === 1 &&
        state.waitingForPlayer &&
        !state.botEnabled &&
        Date.now() - state.waitStart > 3000
    ) {
        state.botEnabled = true;

        const player = state.players[0];

        if (Math.random() < 0.5) {
            player.symbol = "X";
            state.botSymbol = "O";
        } else {
            player.symbol = "O";
            state.botSymbol = "X";
        }

        state.turn = Math.random() < 0.5 ? "X" : "O";

        state.waitingForPlayer = false;

        logger.info("Bot activated after waiting");
    }

    //bot move
    if (
        state.botEnabled &&
        state.turn === state.botSymbol &&
        !state.winner
    ) {
    const bot = state.botSymbol;
    const player = bot === "X"?"O":"X";

    //try to win
    let move = findWinningMove(state.board, bot);

    //try to blk player
    if(!move){
        move = findWinningMove(state.board, player);
    }

    //take center
    if(!move && state.board[1][1] === ""){
        move = [1,1];
    }

    //take random
    if(!move){
        let empty = []; //collect all empty cells

        for(let i=0; i<3; i++){
            for(let j=0; j<3; j++){
                if(state.board[i][j] === ""){
                    empty.push([i,j]);
            }
        }
    }
    if(empty.length > 0){
        move = empty[Math.floor(Math.random() * empty.length)];
    }
}

//apply move
if(move){
    let [x, y] = move;

    state.board[x][y] = bot;
    logger.info("Bot played at: " + x + "," + y);

    let result = checkWinner(state.board);
    if(result){
        state.winner = result.winner;
        state.winningLine = result.line;
    }
    state.turn = state.turn === "X"?"O":"X";
    state.turnStartTime = Date.now();

    dispatcher.broadcastMessage(1, JSON.stringify(state));
    }
}

    return { state };
}

function matchLeave(ctx, logger, nk, dispatcher, tick, state, presences) {
    presences.forEach(p => {state.players = state.players.filter(pl => pl.userId !== p.userId)});
    logger.info("Player left. Remaining players: " + JSON.stringify(state.players));

    //if one player remains they win
    if(state.players.length === 1 && !state.winner){
        const remainingPlayer = state.players[0];

        state.winner = remainingPlayer.userId;
        state.winReason = "opponent_left";

        state.winningLine = [];

        logger.info("Player left - remaining player wins:" + state.winner);
        dispatcher.broadcastMessage(1, JSON.stringify(state));
    }

    //no player -> end match
    if (state.players.length === 0) {
        logger.info("No players left. Ending match.");
        return null;
    }
    return { state };
}

function matchTerminate(ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
    return { state };
}

function matchSignal(ctx, logger, nk, dispatcher, tick, state, data) {
    return { state };
}

function matchJoinAttempt(ctx, logger, nk, dispatcher, tick, state, presence, metadata) {
    const alreadyInMatch = state.players.find(p => p.userId === presence.userId);

    logger.info("Join attempt by userId:" + presence.userId);
    logger.info("Current players:" + JSON.stringify(state.players));

    if(alreadyInMatch){
        logger.info("Player already in match allowing rejoin");
        return {state, accept: true};
    }
    
    if(state.players.length >= 2 && !alreadyInMatch){
        logger.info("Match full rejecting player: ", presence.userId);
        return {state, accept: false};
    }
    logger.info("New player joining:"+ presence.userId);
    return { state, accept: true };
}

function generateCodes() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function createMatchRpc(ctx, logger, nk, payload) {
    let matchId = nk.matchCreate("tic-tac-toe", {});

    // let code = generateCodes();
    // roomCodes[code] = matchId;

    // logger.info("Room created: " + code + " -> " + matchId);

    return JSON.stringify({ matchId, code: matchId});
}

function joinByCodeRpc(ctx, logger, nk, payload) {
    let data = JSON.parse(payload || "{}");
    // let code = data.code;

    // let matchId = roomCodes[code];
    let matchId = data.code;

    if(!matchId){
        return JSON.stringify({ error: "Invalid code" });
    }
    //logger.info("Joining match by code: " + code + " -> " + matchId);

    return JSON.stringify({ matchId });
}
//find exisiting match else find new one
function findOrCreateMatch(ctx, logger, nk, payload){
     let matches = nk.matchList(10, true, "tic-tac-toe", 0, 2);

    let availableMatch = matches.find(m => m.size === 1);

    if(availableMatch){
        logger.info("Joining existing match: " + availableMatch.matchId);
        return JSON.stringify({ matchId: availableMatch.matchId });
    }

    let matchId = nk.matchCreate("tic-tac-toe", {});
    logger.info("Creating new match: " + matchId);

    return JSON.stringify({ matchId });
}

function InitModule(ctx, logger, nk, initializer) {
    initializer.registerMatch("tic-tac-toe", {
        matchInit: matchInit,
        matchJoin: matchJoin,
        matchLoop: matchLoop,
        matchLeave: matchLeave,
        matchTerminate: matchTerminate,
        matchSignal: matchSignal,
        matchJoinAttempt: matchJoinAttempt
    });

    initializer.registerRpc("create_match", createMatchRpc);
    initializer.registerRpc("find_match", findOrCreateMatch);
    initializer.registerRpc("join_by_code", joinByCodeRpc);
}