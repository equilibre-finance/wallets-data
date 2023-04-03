'use strict'
const rpcArchive = 'https://evm.data.equilibre.kava.io';
const fs = require('fs');
const Web3 = require('web3');
const web3 = new Web3(rpcArchive);

const votingEscrowContract = '0x35361C9c2a324F5FB8f3aed2d7bA91CE1410893A';
const bribeContract = '0xc401adf58F18AF7fD1bf88d5a29a203d3B3783B2';
const minAmount = 165;

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
const FACTOR = 0.25 / 365;

function computeVeVARA(amount, locktime, ts) {
    const days = parseInt((locktime - ts) / DAY);
    return parseFloat(FACTOR * days * amount);
}


async function scanBlockchain(config) {
    let size = 1000, lines = [], endProcessing = false;
    info.push(`|Address|Vara|veVara|Days|`);
    info.push(`|:---|---:|---:|---:|`);

    for (let i = config.startBlockNumber; i < config.endBlockNumber; i += size) {
        if( endProcessing ) break;
        await new Promise(resolve => setTimeout(resolve, 1000));
        const args = {fromBlock: i, toBlock: i + size};
        console.log(args);
        try {
            await votingEscrow.getPastEvents(args, async function (error, events) {
                if (error) {
                    console.log(error.toString());
                } else {
                    for (let j = 0; j < events.length; j++) {
                        const e = events[j];
                        if (!e.event) continue;
                        if (e.event !== 'Deposit') continue;
                        const u = e.returnValues;
                        let amount = u.value;
                        const isAdd = u.deposit_type == 2 ? true : false;
                        let locktime = u.locktime;
                        if( isAdd ) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            const LockedBalance = await votingEscrow.methods.locked(u.tokenId).call();
                            locktime = LockedBalance.end.toString();
                            amount = LockedBalance.amount.toString(); // if user is incrementing a lock time
                        }
                        amount = parseFloat(web3.utils.fromWei(amount));
                        if( amount === 0 ) continue;
                        const ve = await computeVeVARA(amount, parseInt(locktime), parseInt(u.ts));
                        if (ve === 0) continue;
                        const days = parseInt((locktime - u.ts) / DAY);
                        if (days === 0) continue;
                        const line = `|${u.provider}|${parseFloat(amount).toFixed(2)}|${parseFloat(ve).toFixed(2)}|${days}|`;
                        if (u.ts > config.epochEnd ) {
                            console.log(` STOP: (${i}) locktime=${locktime} epochEnd=${config.epochEnd}`);
                            endProcessing = true;
                            break;
                        }
                        totalVARA += amount;
                        totalVE += ve;
                        console.log(line);
                        info.push(line);
                        address[u.provider] = address[u.provider] || 0;
                        address[u.provider] += ve;
                    }
                }

            });
        } catch (e) {
            console.log(e.toString());
        }
    }
    const TOTAL = `# Totals:\n\n- VARA ${totalVARA}\n- veVARA ${totalVE}\n\n`;
    console.log(TOTAL);
    info = prepend(TOTAL, info);
    let args = [];
    for (let user in address) {
        const amount = address[user];
        if (amount < minAmount) {
            continue;
        }
        lines.push(`${user},${amount}`);
        args.push(user);
    }

    fs.writeFileSync('../vara-weekly-lockers.md', info.join('\n'));
    fs.writeFileSync('../vara-weekly-lockers.csv', lines.join('\n'));
    fs.writeFileSync('../vara-weekly-lockers.json', JSON.stringify(args));
}

async function getBlocksFromLastEpoch() {
    const WEEK = 86400 * 7;
    const latest = await web3.eth.getBlock("latest");
    const epochEnd = parseInt((await bribe.methods.getEpochStart(latest.timestamp).call()).toString());
    const epochStart = parseInt((await bribe.methods.getEpochStart(epochEnd - WEEK).call()).toString());
    const blocksBehind = parseInt((latest.timestamp - epochStart) / 6.4);
    const startBlockNumber = latest.number - blocksBehind;
    const endBlockNumber = latest.number;
    return {
        epochStart: epochStart,
        epochEnd: epochEnd,
        startBlockNumber: startBlockNumber,
        endBlockNumber: endBlockNumber
    }
}

async function main() {
    // return await scanByBlock(4083807);
    const config = await getBlocksFromLastEpoch();
    console.log(config);
    try {
        await scanBlockchain(config);
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
