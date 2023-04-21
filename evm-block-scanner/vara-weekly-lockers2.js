'use strict'

const dotenv = require('dotenv');
dotenv.config();
const rpcArchive = process.env.KAVA_RPC;
const fs = require('fs');
const Web3 = require('web3');
const web3 = new Web3(rpcArchive);

const votingEscrowContract = '0x35361C9c2a324F5FB8f3aed2d7bA91CE1410893A';
const bribeContract = '0xc401adf58F18AF7fD1bf88d5a29a203d3B3783B2';
const MIN_AMOUNT = 1500, MIN_DAYS = 1400;

let address = [], info = [], totalVARA = 0, totalVE = 0, json = [];
const abi = JSON.parse(fs.readFileSync("./voting-escrow-abi.js", "utf8"));
const votingEscrow = new web3.eth.Contract(abi, votingEscrowContract);

const bribe_abi = JSON.parse(fs.readFileSync('./bribe-abi.js'));


const YEAR = 365;
const DAY = 86400;
const FACTOR = 0.25 / YEAR;

function computeVeVARA(amount, locktime, ts) {
    const days = parseInt((locktime - ts) / DAY);
    return parseFloat(FACTOR * days * amount);
}

async function onEventData( events ){
    for (let j = 0; j < events.length; j++) {
        const e = events[j];
        if (!e.event) continue;
        if (e.event !== 'Deposit') continue;
        const u = e.returnValues;
        let amount = u.value;
        let locktime = u.locktime;
        const locked = await votingEscrow.methods.locked(u.tokenId).call();
        const LockedBalance = parseFloat(web3.utils.fromWei( (locked.amount).toString() ));
        if( u.deposit_type == 2 ) {
            locktime = locked.end;
        }
        amount = parseFloat(web3.utils.fromWei(amount));
        if( amount === 0 ) continue;
        const ve = computeVeVARA(amount, parseInt(locktime), parseInt(u.ts));
        if (ve === 0) continue;
        const days = parseInt((locktime - u.ts) / DAY);
        if (days === 0) continue;
        const date = new Date(u.ts*1000).toISOString();
        const line = `|${u.provider}|${parseFloat(amount).toFixed(2)}|${parseFloat(ve).toFixed(2)}|${days}|${date}|${u.deposit_type}|${LockedBalance}|`;
        if (u.ts < config.epochStart ) {
            console.log(` IGNORE: locktime=${locktime} epochEnd=${config.epochEnd}`);
            continue;
        }
        if (u.ts > config.epochEnd ) {
            console.log(` STOP: locktime=${locktime} epochEnd=${config.epochEnd}`);
            endProcessing = true;
            break;
        }
        totalVARA += amount;
        totalVE += ve;
        console.log(line);
        info.push(line);
        json.push({
            wallet: u.provider,
            amount: amount,
            ve: ve,
            days: days,
            date: u.ts,
            type: u.deposit_type,
            LockedBalance: LockedBalance
        });
        address[u.provider] = address[u.provider] || 0;
        address[u.provider] += amount;
    }
}

let endProcessing = false;
let config;

async function getEvents(args){
    let status;
    try {
        const r = await votingEscrow.getPastEvents(args);
        await onEventData(r);
        status = true;
    } catch (e) {
        console.log(e.toString());
        status = false;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    return status;
}
async function scanBlockchain() {
    let size = config.debug ? 1 : 1000
    let lines = [];

    info.push(`|Address|Vara|veVara|Days|Date|Type|`);
    info.push(`|:---|---:|---:|---:|---:|LockedBalance|`);

    for (let i = config.startBlockNumber; i < config.endBlockNumber; i += size) {
        if( endProcessing ) break;
        const args = {fromBlock: i+1, toBlock: i + size};
        console.log(args);
        while( ! await getEvents(args) ){
            console.log(' - trying again: ', args);
        }

    }
    const TOTAL = `# Totals:\n\n- VARA ${totalVARA}\n- veVARA ${totalVE}\n\n-JSON: vara-weekly-lockers2.json\n\n---\n\n`;
    console.log(TOTAL);
    info = prepend(TOTAL, info);
    let args = [];
    for (let user in address) {
        const amount = address[user];
        lines.push(`${user},${amount}`);
        args.push(user);
    }

    if( ! config.debug ) {
        fs.writeFileSync('../vara-weekly-lockers2.md', info.join('\n'));
        fs.writeFileSync('../vara-weekly-lockers2.json', JSON.stringify(json));
    }
}

async function getBlocksFromDates(block, epochStart, epochEnd) {
    const latest = await web3.eth.getBlock("latest");
    const blocksBehind = parseInt((latest.timestamp - epochStart) / 6.4);
    const startBlockNumber = latest.number - blocksBehind;
    const endBlockNumber = latest.number;
    config = {
        epochStart: epochStart,
        epochEnd: epochEnd,
        startBlockNumber: startBlockNumber,
        endBlockNumber: endBlockNumber
    };
    if( block ){
        config.debug = true;
        config.startBlockNumber = block;
        config.endBlockNumber = block+1;
    }
}

async function main() {
    const block = 0;
    await getBlocksFromDates(block, 1680825600, 1681862399);
    try {
        await scanBlockchain();
    } catch (e) {
        console.log(`Error running the chain scan: ${e.toString()}`);
    }
}

function prepend(value, array) {
    let newArray = array.slice();
    newArray.unshift(value);
    return newArray;
}

main();
