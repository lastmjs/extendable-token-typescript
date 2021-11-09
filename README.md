# extendable-token-typescript

## Installation

Install the following:

* [Node.js](https://github.com/nvm-sh/nvm)
* [Rust](https://www.rust-lang.org/tools/install)
* [dfx](https://sdk.dfinity.org/docs/quickstart/local-quickstart.html#download-and-install)

Run the following terminal commands:

```bash
git clone https://github.com/lastmjs/extendable-token-typescript
cd extendable-token-typescript
npm install
```

## Development deployment

Run the following terminal commands:

```bash
dfx start --background
dfx deploy
```

Open `http://r7inp-6aaaa-aaaaa-aaabq-cai.localhost:8000` in a web browser. Enter `ryjl3-tyaaa-aaaaa-aaaba-cai` as the canister id in the web interface, and upload `extendable-token-typescript/canisters/jsonic/jsonic.did` as the did file.

You can then use the web interface to call the methods on the JSONIC canister.

## Production deployment

If you want to deploy your own canisters to the IC then make sure to delete `extendable-token-typescript/canister_ids.json`.

Run the following terminal commands:

```bash
dfx deploy --network ic
```