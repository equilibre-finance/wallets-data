'use strict'
const rpcArchive = 'https://evm.data.equilibre.kava.io';
const fs = require('fs');
const Web3 = require('web3');
const web3 = new Web3(rpcArchive);

const votingEscrowContract = '0x35361C9c2a324F5FB8f3aed2d7bA91CE1410893A';
const bribeContract = '0xc401adf58F18AF7fD1bf88d5a29a203d3B3783B2';
const minAmount = 165;

let BLOCK_START = 0, BLOCK_END = 0;

let address = [], info = [], totalVARA = 0, totalVE = 0;
const abi = JSON.parse(fs.readFileSync("./voting-escrow-abi.js", "utf8"));
const votingEscrow = new web3.eth.Contract(abi, votingEscrowContract);

const bribe_abi = JSON.parse(fs.readFileSync('./bribe-abi.js'));
const bribe = new web3.eth.Contract(bribe_abi, bribeContract);
let epoch;


/*
1 VARA locked for 1 year = 0.25 veVARA
1 VARA locked for 2 years = 0.50 veVARA
1 VARA locked for 3 years = 0.75 veVARA
1 VARA locked for 4 years = 1.00 veVARA
* */
const YEAR = 365;
const DAY = 86400;
function computeVeVARA(amount, locktime, ts){
    const days = (locktime - ts) / DAY;
    const years = days / YEAR;
    const iMAXTIME = 4 * YEAR * DAY
    const slope = amount / iMAXTIME;
    const bias = slope * (locktime - ts) * years;
    // const multiplier = parseFloat(bias/days).toFixed(2);
    // console.log('amount', amount, 'days', days, 'reward', bias, 'years', years, 'multiplier', multiplier);
    return parseFloat(bias);
}

async function onNewEvent(error, events){
    if (error) {
        console.log(error);
    } else {
        for (let j = 0; j < events.length; j++) {
            const e = events[j];
            if (!e.event) continue;
            if (e.event != 'Deposit') continue;
            const u = e.returnValues;
            const amount = parseFloat(web3.utils.fromWei(u.value));
            const ve = await computeVeVARA(amount, parseInt(u.locktime), parseInt(u.ts));
            const line = `${u.provider}, VARA: ${amount}, veVARA: ${ve}`;
            if( u.locktime < epoch ){
                console.log(` DISCARD: ${line}`);
                continue;
            }
            totalVARA += amount;
            totalVE += ve;
            console.log(line);
            info.push(line);
            address[u.provider] = address[u.provider] || 0;
            address[u.provider] += ve;
        }
    }

}

async function scanByBlock(block){
    const from = parseInt(block);
    const to = from + 1000;
    try {
        await votingEscrow.getPastEvents({fromBlock: from, toBlock: to}, onNewEvent);
    }catch(e){
        console.log(e.toString());
    }
}

async function scanBlockchain(start, end) {
    let size = 1000, lines = [];
    for (let i = start; i < end; i += size) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const from = i;
        const to = (i + size) - 1;
        try {
            await votingEscrow.getPastEvents({fromBlock: from, toBlock: to}, onNewEvent);
        }catch(e){
            console.log(e.toString());
        }
    }
    lines.push(`# Total: VARA ${totalVARA}, veVARA ${totalVE}`);
    for( let user in address ){
        const amount = address[user];
        if( amount < minAmount ){
            continue;
        }
        lines.push(`${user},${web3.utils.toWei(amount.toString())}`);
    }
    fs.writeFileSync('../vara-weekly-lockers.md', info.join('\n') );
    fs.writeFileSync('../vara-weekly-lockers.csv', lines.join('\n') );
}
async function getEpochBlock(){
    BLOCK_END = parseInt(await web3.eth.getBlockNumber());
    const latestBlock = await web3.eth.getBlock("latest");
    epoch = await bribe.methods.getEpochStart(latestBlock.timestamp).call();
    console.log(`epoch=${epoch}`);
    for(let i = BLOCK_END; i > 0 ; i -= 10000 ){
        const currentBlock = await web3.eth.getBlock(i);
        console.log(`${i} ${currentBlock.timestamp} ${epoch}`);
        if( currentBlock.timestamp <= epoch){
            BLOCK_START = i;
            console.log(`BLOCK_START=${BLOCK_START}`);
            break;
        }
    }
}
async function main() {

    // computeVeVARA(360, 1678318983+(YEAR*DAY), 1678318983);
    // computeVeVARA(360, 1678318983+(YEAR*DAY*2), 1678318983);
    // computeVeVARA(360, 1678318983+(YEAR*DAY*4), 1678318983);
    // await scanByBlock(3897052);

    await getEpochBlock();
    if( BLOCK_END && BLOCK_START ){
        await scanBlockchain(BLOCK_START, BLOCK_END);
    }else{
        console.log('error in blocks start/end.');
    }

}

main();
