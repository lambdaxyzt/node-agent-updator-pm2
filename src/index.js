import pm2 from 'pm2'
import fs from 'fs';
import fetch from 'node-fetch';
import cron from "cron"
import * as path from "path";

const credFile = path.resolve("./data/cred.json");
const agentFile = path.resolve("./data/agent.js");

(async function main() {
        function readDataCred() {
            const data = fs.readFileSync(credFile, {encoding: "utf-8"})
            return JSON.parse(data)
        }

        function writeDataCred(object) {
            const data = readDataCred()
            fs.writeFileSync(credFile, JSON.stringify({...data, ...object}, null, 2))
        }


        const getAgentHash = () => {
            const data = readDataCred()
            return fetch(data.url + "/ups/update/agent/hash", {
                method: "POST",
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({token: data.token})
            })
                .then(res => res.json())
                .then(data => {
                    return data.hashAgent
                })
        }


        const generateSetting = async () => {
            const data = readDataCred()
            return fetch(data.url + "/ups/update/setting", {
                method: "POST",
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({token: data.token})
            })
                .then(res => res.json())
                .then(data => {
                    writeDataCred({...data.setting})
                }).catch(err => {
                    console.log(err.message)
                })
        }

        const downloadAgentFile = (async (url, path) => {
            const data = readDataCred()
            const fileStream = fs.createWriteStream(path);
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({token: data.token})
            })
                .then(res => res)
                .catch(err => {
                    console.log(err.message)
                })
            await new Promise((resolve, reject) => {
                res.body.pipe(fileStream);
                res.body.on("error", reject);
                fileStream.on("finish", () => {
                    console.log("agent downloaded")
                    resolve()
                });
            });
        });

        const RestartUpdateAgent = async () => {
            await generateToken()
            const data = readDataCred()
            const hashAgent = await getAgentHash()
            console.log(`hash of agent app is : ${hashAgent}`)
            if (await getAgentHash() !== data?.hashAgent) {
                await downloadAgentFile(data.url + "/ups/update/agent", agentFile)
                await writeDataCred({hashAgent})
                pm2.connect(function (err) {
                    if (err) {
                        console.error(err)
                        process.exit(2)
                    }
                    return pm2.restart('agent', (err, proc) => {
                        console.log("agent restarted")
                        // Disconnects from PM2
                        return pm2.disconnect()
                    })
                })
            } else {
                console.log("hash is identical agent will not update")
            }
        }
        const data = readDataCred()
        pm2.connect(function (err) {
            if (err) {
                console.error(err)
                process.exit(2)
            }

            pm2.start({
                name: 'agent',
                script: agentFile,
                env: {
                    "NODE_ENV": "development",

                }
            }, function (err, apps) {
                if (err) {
                    console.error(err)
                    return pm2.disconnect()
                }
            })
        })
        async function call() {
            console.log("is call running")
            await generateSetting()
            await RestartUpdateAgent()
        }

        const CronJob = cron.CronJob;
        let taskRunning=false
        const job3 = new CronJob(
            data.settingCheck, async () => {
                if (taskRunning) {
                    console.log('returning')
                    return
                }
                taskRunning=true
                try {
                    await call()
                } catch (err) {
                    console.log(err);
                }

            }
        )
        job3.start();
    }
)()
