import {
    html,
    render as litRender,
    TemplateResult
} from 'lit-html';
import { StoicIdentity } from 'ic-stoic-identity';
import { createObjectStore } from 'reduxular';
import {
    Actor,
    HttpAgent,
    Identity
} from '@dfinity/agent';
import {
    SupplyResponse,
    Accounts
} from '../../jsonic/jsonic';

type State = Readonly<{
    claiming: boolean;
    holders: Accounts | null,
    identity: Identity | null;
    supply: bigint | null;
}>;

const InitialState: State = {
    claiming: false,
    holders: null,
    identity: null,
    supply: null
};

class JSONICApp extends HTMLElement {
    shadow = this.attachShadow({
        mode: 'closed'
    });
    store = createObjectStore(InitialState, (state: State) => litRender(this.render(state), this.shadow), this);
    
    async connectedCallback() {
        await this.getAndSetSupply();
        await this.getAndSetHolders();
    }

    async claim() {
        this.store.claiming = true;

        const identity = await StoicIdentity.connect();

        const idlFactory = ({ IDL }) => {
            return IDL.Service({
                'claim': IDL.Func([], [IDL.Bool], [])
            });
        };
    
        const agent = new HttpAgent({
            identity
        });

        const actor = Actor.createActor(idlFactory, {
            agent,
            canisterId: 'nmgdh-xqaaa-aaaae-qaauq-cai'
        });

        const result = await actor.claim();

        if (result === true) {
            alert('You have successfully claimed 1 JSONIC');
            
            await this.getAndSetSupply();
            await this.getAndSetHolders();
        }
        else {
            alert('Something went wrong...try again?');
        }

        StoicIdentity.disconnect();

        this.store.claiming = false;
    }

    async getAndSetSupply() {
        const idlFactory = ({ IDL }) => {
            return IDL.Service({
                'supply': IDL.Func([IDL.Text], [IDL.Variant({ 'ok' : IDL.Nat })], ['query'])
            });
        };
    
        const agent = new HttpAgent();
    
        const actor = Actor.createActor(idlFactory, {
            agent,
            canisterId: 'nmgdh-xqaaa-aaaae-qaauq-cai'
        });

        const result = await actor.supply('0') as SupplyResponse;

        this.store.supply = result.ok as unknown as bigint / BigInt(10 ** 8);
    }

    async getAndSetHolders() {
        const idlFactory = ({ IDL }) => {
            return IDL.Service({
                'registry': IDL.Func([], [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Nat))], ['query'])
            });
        };
    
        const agent = new HttpAgent();

        const actor = Actor.createActor(idlFactory, {
            agent,
            canisterId: 'nmgdh-xqaaa-aaaae-qaauq-cai'
        });

        const holders = await actor.registry() as Accounts;

        const sortedHolders = [...holders].sort((a, b) => {
            if (a[1] < b[1]) {
                return 1;
            }

            if (a[1] > b[1]) {
                return -1;
            }

            return 0;
        });

        this.store.holders = sortedHolders;
    }

    render(state: State): TemplateResult {
        return html`
            <style>
                .main-container {
                    height: 100%;
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    box-sizing: border-box;
                }

                .claim-container {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    width: 25%;
                    padding-top: 10vh;
                    box-sizing: border-box;
                }

                .claim-button {
                    font-weight: bold;
                    font-size: 15px;
                    border: solid 1px rgba(1, 1, 1, .1);
                    padding: 25px;
                    cursor: pointer;
                    box-sizing: border-box;
                    border-radius: 5px;
                }

                .claim-text {
                    padding-top: 25px;
                }

                .claim-button:hover {
                    border: solid 1px rgba(1, 1, 1, .25);
                }

                .supply-container {
                    flex: 1;
                    box-sizing: border-box;
                }

                .holders-container {
                    flex: 10;
                    box-sizing: border-box;
                }
            </style>
            
            <div class="main-container">
                <div class="claim-container">
                    <div>
                        <button
                            ?disabled=${state.claiming === true}
                            class="claim-button"
                            @click=${() => this.claim()}
                        >${state.claiming === true ? 'Claiming...' : 'Claim 1 JSONIC'}</button>
                    </div>

                    <div class="claim-text">
                        <p>
                            JSONIC is the first <a href="https://github.com/Toniq-Labs/extendable-token" target="_blank">EXT token</a> written in TypeScript/JavaScript and deployed to the <a href="https://dfinity.org/" target="_blank">Internet Computer</a>.
                            The original code can be found in <a href="https://github.com/lastmjs/extendable-token-typescript/blob/main/canisters/jsonic/jsonic.ts" target="_blank">this repository</a>.
                        </p>

                        <p>
                            Anyone can claim tokens at any time, and there is no supply cap.
                        </p>
                        
                        <p>
                            The controllers for JSONIC and this frontend have both been set to a <a href="https://github.com/ninegua/ic-blackhole" target="_blank">black hole address</a>.
                            This essentially means they are autonomous and can only be practically updated through NNS proposals.
                        </p>
                        
                        <p>
                            JSONIC canister id: nmgdh-xqaaa-aaaae-qaauq-cai
                            <br>
                            Faucet canister id: nceop-maaaa-aaaae-qaavq-cai
                        </p>
                    </div>
                </div>
    
                <div class="supply-container">
                    <div><h1>Total Supply</h1></div>
                    <div>${state.supply === null ? 'Loading...' : `${state.supply} JSONIC`}</div>
                </div>

                <div class="holders-container">
                    <div><h1>Holders</h1></div>
                    <div>
                        ${state.holders === null ? 'Loading...' : state.holders.map((holder) => {
                            const numJSONIC = holder[1] as unknown as bigint / BigInt(10 ** 8);
                            const percentJSONIC = (Number(numJSONIC) / Number(state.supply) * 100).toFixed(2);

                            return html`
                                <div>${holder[0]}: ${numJSONIC} JSONIC, ${percentJSONIC}%</div>
                            `;
                        })}
                    </div>
                </div>
            </div>
        `;
    }
}

window.customElements.define('jsonic-app', JSONICApp);