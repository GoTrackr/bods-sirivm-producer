import Axios from 'axios'
import { XMLParser } from 'fast-xml-parser'
import { Kafka, RecordMetadata } from 'kafkajs'
import { Duplex, PassThrough } from 'node:stream'
import sax from 'sax'
import { SaXPath } from 'saxpath'
import unzip, { type Entry } from 'unzip-stream'

// Define environment variables
const BODS_APIKEY = process.env?.BODS_APIKEY,
    BODS_HOST = process.env?.BODS_HOST || "data.bus-data.dft.gov.uk",
    BODS_OPERATORS = process.env?.BODS_OPERATORS,
    KAFKA_CLIENTID = process.env?.KAFKA_CLIENTID || "bods-sirivm-producer",
    KAFKA_BROKERS = process.env?.KAFKA_BROKERS || "localhost:9092",
    KAFKA_TOPIC = process.env?.KAFKA_TOPIC || "vehicles-import-sirivm",
    ENABLE_LOGGING = !!(process.env?.LOGGING || false),
    MINIMUM_SECONDS_BETWEEN_CALLS = parseInt(process.env?.MINIMUM_SECONDS_BETWEEN_CALLS || "") || 26

// Required environment variable validation
if(!KAFKA_CLIENTID) throw new Error("KAFKA_CLIENTID must be defined...")
if(!KAFKA_BROKERS) throw new Error("KAFKA_BROKERS must be defined...")
if(!KAFKA_TOPIC) throw new Error("KAFKA_TOPIC must be defined...")

// Parse 'complex' environment variables
const
    operators = BODS_OPERATORS ? BODS_OPERATORS.split(",") : [],
    shouldUseBulkArchive = !operators.length,
    kafkaBrokers = KAFKA_BROKERS.split(",")

// Subjective environment variable validation
if(!shouldUseBulkArchive && !BODS_APIKEY) throw new Error("To use filter by operators, the BODS_APIKEY must be provided...")

// Define required runtime variables
const
    axios = Axios.create({
        baseURL: `https://${BODS_HOST}`
    }),
    kafka = new Kafka({
        clientId: KAFKA_CLIENTID,
        brokers: kafkaBrokers
    }),
    minimumTimeBetween = MINIMUM_SECONDS_BETWEEN_CALLS * 1000,
    parser = new XMLParser(),
    producer = kafka.producer(),
    vehicleActivityXPath = "//Siri/ServiceDelivery/VehicleMonitoringDelivery/VehicleActivity"

// Basic log forwarder function to reduce log size when disabled
const log = (...args: any[]): void => {
        if(ENABLE_LOGGING)
            return console.log(...args)
    }

// Handle archive stream parsing, with a subsequent XML parser
const handleArchive = async (entry: Entry, streamer: Duplex): Promise<void> => {
    const filePath = entry.path,
        type = entry.type,
        size = entry.size

    log("[INFO]", "Parsing", type.toLowerCase(), `"${filePath}"`, `(${size} bytes)`)

    if (filePath === "siri.xml") {
        return handleXML(entry, streamer)
    } else {
        entry.autodrain()
        return Promise.resolve()
    }
}

// Handle XML stream parsing
const handleXML = async (file: PassThrough, streamer: Duplex): Promise<void> => {
    file.pipe(streamer);

    return new Promise((resolve, reject) => {
        let error: Error | undefined;

        streamer.on("error", (e) => {
            error = e;
            reject(e);
        });

        streamer.on("end", () => {
            if (!error) resolve();
        });
    });
}

// Basic loop closer, to end the main application loop
const closeGracefully = () => {
    log("[INFO]", "Exit signal received! Terminating at next opportunity...")
    shouldContinueLoop = false
}

// Handle signals to close applcation
process.once('SIGINT', closeGracefully)
process.once('SIGTERM', closeGracefully)

log("[KAFKA]", "Connecting to broker(s)...")

// Connect to Kafka
await producer.connect()

log("[KAFKA]", "Connected!")

let shouldContinueLoop = true

log("[INFO]", "Starting...")

// Continue main application loop until otherwise specified
while(shouldContinueLoop) {
    log("[LOOP]", "New iteration...")

    const startTime = Date.now()

    log("[LOOP]", "Starting...")

    // Define XML parsers
    const saxParser = sax.createStream(true),
        streamer = new SaXPath(saxParser, vehicleActivityXPath),
        streamerEndPromise = new Promise((resolve) => streamer.on("end", resolve))

    // Define variables for counting/stats
    let promises: Promise<RecordMetadata[]>[] = [],
        i = 0

    // Function to execute on VehicleActivity XPath match found
    streamer.on('match', async function(xml: string) {
        i++

        // Parse the XML of the current found item
        const vehicleActivity = parser.parse(xml).VehicleActivity

        // Push the promise of the Kafka message send for statistics and return to synchronicity
        promises.push(
                producer.send({
                    topic: KAFKA_TOPIC,
                    messages: [
                        { value: JSON.stringify(vehicleActivity) },
                    ],
                })
            )

        // Complete the current item loop
        return Promise.resolve()
    })

    // On completion of the streamer, log how many items were handled
    streamer.on("end", () => {
        log("[INFO]", "Found", i, "VehicleActivities in XML!")
    })

    const requestPath = shouldUseBulkArchive ?
            `/avl/download/bulk_archive${BODS_APIKEY ? `?api_key=${BODS_APIKEY}` : ''}`
        : `/api/v1/datafeed?operatorRef=${operators.join(',')}&api_key=${BODS_APIKEY}`

    // Start main logic to fetch bulk BODS SIRI-VM data as a file stream
    await axios.get(requestPath, { responseType: 'stream' }).then(async r => {
            // Return the promise for completion of the current file to be parsed
            return new Promise((resolve, reject) => {
                    if(shouldUseBulkArchive) {
                        // Pipe the data from the response into the streaming unzipper
                        r.data.pipe(unzip.Parse())
                            .on("entry", async (entry: Entry) => {
                                await handleArchive(entry, saxParser)
                            })
                            .on("close", () => {
                                resolve(!0)
                            })
                    } else {
                        // Pipe the data from the response into the streaming SIRI-VM parser
                        handleXML(r.data, saxParser)
                            .then(() => resolve(!0))
                            .catch(e => reject(e))
                    }
                })
        }).then(async () => {
            await streamerEndPromise
        }).then(async () => {
            await Promise.allSettled(promises)
        }).finally(async () => {
            log("[INFO]", "Exited with", promises.length, "concluded promises!")
            
            log("[LOOP]", "Done!")

            const endTime = Date.now(),
                diffMs = endTime - startTime,
                remainingMs = minimumTimeBetween - diffMs

            if(diffMs < 1000) {
                log("[LOOP]", "Took:", diffMs, "ms")
            } else {
                log("[LOOP]", "Took:", diffMs / 1000, "s")
            }

            // Skip the potential wait, if another loop won't happen
            if(!shouldContinueLoop) return

            if(remainingMs > 0) {
                if(remainingMs < 1000) {
                    log("[LOOP]", "Waiting", remainingMs, "ms...")
                } else {
                    log("[LOOP]", "Waiting", remainingMs / 1000, "s...")
                }
                await new Promise((resolve) => {
                    setTimeout(resolve, remainingMs)
                })
            }

            log("[LOOP]", "Completed iteration!")
        })
}

log("[LOOP]", "Ended!")

log("[KAFKA]", "Disconnecting...")

// Cleanly disconnect from Kafka
await producer.disconnect()

log("[INFO]", "Exiting...")

process.exit(0)
