'use strict'
const fs = require('fs');

const contractAddress = '0x35361C9c2a324F5FB8f3aed2d7bA91CE1410893A';
let BLOCK_START = 3708801, BLOCK_END;
const rpcArchive = 'https://evm.kava.io';


const Web3 = require('web3');
const web3 = new Web3(rpcArchive);

let address = [], info = [];
const abi = JSON.parse(fs.readFileSync("./abi/VotingEscrow.json", "utf8"));
const ctx = new web3.eth.Contract(abi, contractAddress);

const bribe_abi = JSON.parse(fs.readFileSync('./abi/ExternalBribe.json'));
const bribe = new web3.eth.Contract(bribe_abi, '0xb692Bb6FEC4AB78C117Ac318c434946862F8aB21');
let epoch;

async function getBlock(block){
    console.log(`getBlock: ${block}`)
    try {
        await ctx.getPastEvents({fromBlock: block, toBlock: block+1000},
            async function (error, events) {
                if (error) {
                    console.log(error);
                } else {
                    await onEvents(events);
                }
            });
    }catch(e){
        console.log(e.toString());
    }
}

/*
1 VARA locked for 1 year = 0.25 veVARA
1 VARA locked for 2 years = 0.50 veVARA
1 VARA locked for 3 years = 0.75 veVARA
1 VARA locked for 4 years = 1.00 veVARA
* */
function computeVeVARA(amount, locktime, ts){
    const days = (locktime - ts) / 86400;
    const vePerDay = 0.25/365;
    console.log('days', days, 'vePerDay', vePerDay);
    return 0;
}
async function onEvents(events){
    for (let j = 0; j < events.length; j++) {
        const e = events[j];
        if (!e.event) continue;
        if (e.event != 'Deposit') continue;
        const u = e.returnValues;
        const veVARA = computeVeVARA(u.value, u.locktime, u.ts);
        const line = `  ${u.provider}, VARA: ${u.value}, veVARA: ${veVARA}`;
        if( u.locktime < epoch ){
            console.log(` DISCARD: ${line}`);
            continue;
        }else {
            console.log(`${line}`);
        }
        info.push(line);
        break;
    }
}

async function scanBlockchain(start, end) {
    let size = 1000;
    for (let i = start; i < end; i += size) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const from = i;
        const to = (i + size) - 1;
        console.log(`@${i}`);
        info.push(`@${i}`);
        try {
            await ctx.getPastEvents({fromBlock: from, toBlock: to},
                async function (error, events) {
                    if (error) {
                        console.log(error);
                    } else {
                        await onEvents(events);
                    }
                });
        }catch(e){
            console.log(e.toString());
        }
    }
    fs.writeFileSync('../airdrop-lockers.txt', JSON.stringify(address) );
    fs.writeFileSync('../airdrop-lockers-info.txt', info.join('\n') );
}
async function getEpochBlock(){
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
    // BLOCK_END = parseInt(await web3.eth.getBlockNumber())
    // await getEpochBlock()
    await getBlock(3897052)
    // await scanBlockchain(BLOCK_START, BLOCK_END);
}

main();
