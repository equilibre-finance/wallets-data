'use strict'

let BLOCK_START, BLOCK_END;
const fs = require('fs');
// use this rpc for the scan
const rpcArchive = process.env.ETH_RPC;
const Web3 = require('web3');
const web3 = new Web3(rpcArchive);

const contractAddress = '0x5f3b5dfeb7b28cdbd7faba78963ee202a494e2a2';
let address = [], hash = {};
const abi = JSON.parse(fs.readFileSync("./curve-lock-eth.abi", "utf8"));
const ctx = new web3.eth.Contract(abi, contractAddress);

async function scanBlockchain(start, end) {
    let size = 1000;
    for (let i = start; i < end; i += size) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const from = i;
        const to = (i + size) - 1;
        console.log(`i=${i}, from=${from}, to=${to}`);
        try {
            const events = await ctx.getPastEvents({fromBlock: from, toBlock: to},
                function (error, events) {
                    if (error) {
                        console.log(error);
                    } else {
                        for (let j = 0; j < events.length; j++) {
                            const e = events[j];
                            if (!e.event) continue;
                            if (e.event != 'Deposit') continue;
                            // console.log(e);
                            const user = e.returnValues;
                            if (!hash[user.provider]) {
                                hash[user.provider] = true;
                                address.push(user.provider);
                                console.log(`\t${user.provider}`);
                            }
                        }
                    }
                });
        }catch(e){
            console.log(e.toString());
        }
    }
    fs.writeFileSync('../curve-lock-eth.txt', address.join('\n'));
}

async function main() {
    BLOCK_START = 10647812;
    BLOCK_END = parseInt(await web3.eth.getBlockNumber());
    await scanBlockchain(BLOCK_START, BLOCK_END);
}

main();
