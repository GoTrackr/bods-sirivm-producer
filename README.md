# BODS SIRI-VM Producer

Kafka producer for the SIRI-VM feed, provided by the Bus Open Data Service from the UK Government's Department for Transport.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Environment Variables](#environment-variables)
- [Docker](#docker)
- [Contributing](#contributing)
- [License](#license)

## Installation

1. Clone the repository:

    ```sh
    git clone https://github.com/GoTrackr/bods-sirivm-producer.git
    cd bods-sirivm-producer
    ```

2. Install dependencies:

    ```sh
    npm install
    ```

3. Build the project:

    ```sh
    npm run build
    ```

## Usage

1. Set the required environment variables (see [Environment Variables](#environment-variables)).

2. Start the application:

    ```sh
    npm start
    ```

## Environment Variables

The following environment variables need to be set for the application to run:

- `BODS_APIKEY`: Your API key for the Bus Open Data Service.
- `BODS_HOST`: Host for the Bus Open Data Service (default: `data.bus-data.dft.gov.uk`).
- `BODS_OPERATORS`: Comma-separated list of operators.
- `KAFKA_CLIENTID`: Client ID for Kafka (default: `bods-sirivm-producer`).
- `KAFKA_BROKERS`: Comma-separated list of Kafka brokers (default: `localhost:9092`).
- `KAFKA_TOPIC`: Kafka topic to produce to (default: `vehicles-import-sirivm`).
- `MINIMUM_SECONDS_BETWEEN_CALLS`: Minimum seconds between API calls (default: `26`).
- `LOGGING`: Enable logging (default: `false`).

## Docker

You can also run the application using Docker.

1. Build the Docker image:

    ```sh
    docker build -t bods-sirivm-producer .
    ```

2. Run the Docker container:

    ```sh
    docker run -e BODS_APIKEY= -e BODS_HOST=string -e BODS_OPERATORS=string -e KAFKA_CLIENTID=string -e KAFKA_BROKERS=string -e KAFKA_TOPIC=string -e MINIMUM_SECONDS_BETWEEN_CALLS=integer -e LOGGING=boolean bods-sirivm-producer
    ```

Alternatively, you can use Docker Compose:

1. Set the environment variables in the `docker-compose.yml` file.

2. Start the services:

    ```sh
    docker-compose up
    ```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is (currently) UNLICENSED.
