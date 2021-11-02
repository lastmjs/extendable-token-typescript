// this file is based on https://github.com/Toniq-Labs/extendable-token which does not yet have a license

import {
    Candid,
    Enum,
    ICBlob,
    Nat,
    Principal,
    Query,
    Result,
    Update,
    u8
} from 'azle';

declare var ic: {
    caller: Principal;
    memory: {
        balances: {
            [key: AccountIdentifier]: Balance | undefined;
        };
        extensions: Extension[];
        initialized: boolean;
        supply: Balance;
    };
};

type Account = Candid<[AccountIdentifier, Balance]>;
export type Accounts = Candid<Account[]>;

type AccountIdentifier = Candid<string>;

type Balance = Candid<Nat>;

type BalanceRequest = Candid<{
    user: User;
    token: TokenIdentifier;
}>;

type BalanceResponse = Candid<Result<Balance, CommonError>>;

type CommonError = Candid<Enum<{
    InvalidToken?: TokenIdentifier;
    Other?: string;
}>>;

type Extension = Candid<string>;
type Extensions = Candid<Extension[]>;

type FungibleMetadata = Candid<{
    name: string;
    symbol: string;
    decimals: u8;
    metadata?: ICBlob
}>;

type Memo = Candid<ICBlob>;

type Metadata = Candid<Enum<{
    fungible?: FungibleMetadata;
    nonfungible?: NonFungibleMetadata;
}>>;

type MetadataResponse = Candid<Result<Metadata, CommonError>>;

type NonFungibleMetadata = Candid<{
    metadata?: ICBlob
}>;

export type SupplyResponse = Candid<Result<Balance, CommonError>>;

type TokenIdentifier = Candid<string>;

type TransferRequest = Candid<{
    from: User;
    to: User;
    token: TokenIdentifier;
    amount: Balance;
    memo: Memo;
    notify: boolean;
}>;

type TransferResponse = Candid<Result<Balance, TransferResponseError>>;

type TransferResponseError = Candid<Enum<{
    Unauthorized?: AccountIdentifier,
    InsufficientBalance?: null,
    Rejected?: null,
    InvalidToken?: TokenIdentifier,
    CannotNotify?: AccountIdentifier,
    Other?: string
}>>;

type User = Candid<Enum<{
    address?: AccountIdentifier,
    principal?: Principal
}>>;

export function init(): Update<boolean> {
    if (ic.memory.initialized === true) {
        return false;
    }

    ic.memory.initialized = true;
    ic.memory.balances = {};
    ic.memory.supply = 0;
    ic.memory.extensions = ['@ext/common'];

    return true;
}

export function balance(request: BalanceRequest): Query<BalanceResponse> {
    const aid = getUserAID(request.user);

    const balance = ic.memory.balances[aid];

    if (balance === undefined) {
        return {
            ok: 0
        };
    }

    return {
        ok: balance
    };
}

export function claim(): Update<boolean> {
    const callerAddress = addressFromPrincipal(ic.caller);

    const balance = ic.memory.balances[callerAddress] ?? 0;

    ic.memory.balances[callerAddress] = balance + 100000000;
    
    const supply = ic.memory.supply;

    ic.memory.supply = supply + 100000000;

    return true;
}

export function extensions(): Query<Extensions> {
    return ic.memory.extensions;
}

export function metadata(token: TokenIdentifier): Query<MetadataResponse> {
    return {
        ok: {
            fungible: {
                name: 'JS on the IC',
                symbol: 'JSONIC',
                decimals: 8
            }
        }
    };
}

export function registry(): Query<Accounts> {
    return Object.entries(ic.memory.balances);
}

export function supply(token: TokenIdentifier): Query<SupplyResponse> {
    return {
        ok: ic.memory.supply
    };
}

export function transfer(request: TransferRequest): Update<TransferResponse> {
    const sender = getUserAID(request.from);
    const spender = addressFromPrincipal(ic.caller);
    const receiver = getUserAID(request.to);

    if (sender !== spender) {
        return {
            err: {
                Unauthorized: spender
            }
        };
    }

    const senderBalance = ic.memory.balances[sender];

    if (
        senderBalance === undefined ||
        senderBalance < request.amount
    ) {
        return {
            err: {
                InsufficientBalance: null
            }
        };
    }

    const newSenderBalance = senderBalance - request.amount;

    ic.memory.balances[sender] = newSenderBalance;

    const receiverBalance = ic.memory.balances[receiver] ?? 0;
    const newReceiverBalance = receiverBalance + request.amount;

    ic.memory.balances[receiver] = newReceiverBalance;

    return {
        ok: request.amount
    };
}

function addressFromPrincipal(principal: Principal): AccountIdentifier {
    const decodedPrincipalUint8Array = decodePrincipalFromText(principal);
    const decodedPrincipalText = [...decodedPrincipalUint8Array].map(x => String.fromCharCode(x)).join('');
    
    const subaccountZero = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0].map(x => String.fromCharCode(x)).join('');
    
    const finalString = `\x0Aaccount-id${decodedPrincipalText}${subaccountZero}`;
    
    const hash: string = sha224(finalString);
    const crc = crc32(new Uint8Array(hash.match(/.{1,2}/g).map(x => parseInt(x, 16))));
    
    return crc + hash;
}

function getUserAID(user: User): AccountIdentifier {
    return user.address ?? addressFromPrincipal(user.principal);
}

/* All below is third-party libraries included directly in this file because imports/modules are not yet working */

// TODO begin principal decoding section, put in module once supported

// Licensing is under the Apache License included below

// Jordan Last has changed the original files licensed under the Apache License

function decodePrincipalFromText(text: string): Uint8Array {
    const canisterIdNoDash = text.toLowerCase().replace(/-/g, '');

    let arr = decode(canisterIdNoDash);
    arr = arr.slice(4, arr.length);

    return arr;
}

const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';

// Build a lookup table for decoding.
const lookupTable: Record<string, number> = Object.create(null);
for (let lookupTableI = 0; lookupTableI < alphabet.length; lookupTableI++) {
  lookupTable[alphabet[lookupTableI]] = lookupTableI;
}

// Add aliases for rfc4648.
lookupTable['0'] = lookupTable.o;
lookupTable['1'] = lookupTable.i;

function decode(input: string): Uint8Array {
    // how many bits we have from the previous character.
    let skip = 0;
    // current byte we're producing.
    let byte = 0;
  
    const output = new Uint8Array(((input.length * 4) / 3) | 0);
    let o = 0;
  
    function decodeChar(char: string) {
      // Consume a character from the stream, store
      // the output in this.output. As before, better
      // to use update().
      let val = lookupTable[char.toLowerCase()];
      if (val === undefined) {
        throw new Error(`Invalid character: ${JSON.stringify(char)}`);
      }
  
      // move to the high bits
    //   val <<= 3; // TODO modified
      val = val << 3;
    //   byte |= val >>> skip; // TODO modified
      byte = byte | (val >>> skip);
    //   skip += 5; // TODO modified
      skip = skip + 5;
  
      if (skip >= 8) {
        // We have enough bytes to produce an output
        // output[o++] = byte; // TODO modified
        // output[o++] = byte;
        output[o] = byte;
        o++;
        // skip -= 8;
        skip = skip - 8;
  
        if (skip > 0) {
          byte = (val << (5 - skip)) & 255;
        } else {
          byte = 0;
        }
      }
    }
  
    for (const c of input) {
      decodeChar(c);
    }
  
    return output.slice(0, o);
  }

// TODO end principal decoding section, put in module once supported

// TODO begin sha224 section, put in module once supported

// https://github.com/litejs/crypto-lite
// THE MIT LICENSE

// Copyright (c) Lauri Rooden <lauri@rooden.ee>

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

function intToHex(arr) {
    for (let i = arr.length; i--;) arr[i] = ("0000000" + (arr[i] >>> 0).toString(16)).slice(-8);
    return arr.join("");
}

// TODO the i++ operation seemed to be messing things up, open issue with boa
function strToInt(str) {
    var i = 0, arr: any = [], len = arr.len = str.length

    for (; i < len;) {
        arr[i>>2] = str.charCodeAt(i)<<24 | str.charCodeAt(i+1)<<16 | str.charCodeAt(i+2)<<8 | str.charCodeAt(i+3)
        i += 4
    }
    return arr
}

function rotL(val, count) {
    return (val << count) | (val >>> (32 - count))
}

// TODO the <<= operation seemed to be messing things up, open issue with boa
function shaInit(bin, len) {
    if (typeof bin == "string") {
        bin = strToInt(bin)
        len = bin.len
    } else len = len || bin.length<<2

    bin[len>>2] = bin[len>>2] | 0x80 << (24 - (31 & (len<<3)))

    len = len<<3

    bin[((len + 64 >> 9) << 4) + 15] = len

    return bin
}

//** sha256
var initial_map = [], constants_map = []

function buildMaps() {
    // getFractionalBits
    function powFraction(c, e) {
        c = Math.pow(c, e)
        return (c - (c>>>0)) * 0x100000000 | 0
    }

    outer: for (var b = 0, c = 2, d; b < 64; c++) {
        // isPrime
        for (d = 2; d * d <= c; d++) if (c % d === 0) continue outer;
        if (b < 8) initial_map[b] = powFraction(c, 0.5)
        constants_map[b] = powFraction(c, 1 / 3)
        b += 1
    }
}

function sha256(data, _len, is224) {
    if (!initial_map[0]) buildMaps()

    var a, b, c, d, e, f, g, h, t1, t2, j, i = 0, w = [], A = initial_map[0], B = initial_map[1], C = initial_map[2], D = initial_map[3], E = initial_map[4], F = initial_map[5], G = initial_map[6], H = initial_map[7], bin = shaInit(data, _len), len = bin.length, K = constants_map

    if (is224) {
        A = 0xc1059ed8
        B = 0x367cd507
        C = 0x3070dd17
        D = 0xf70e5939
        E = 0xffc00b31
        F = 0x68581511
        G = 0x64f98fa7
        H = 0xbefa4fa4
    }

    for (; i < len; i+=16, A+=a, B+=b, C+=c, D+=d, E+=e, F+=f, G+=g, H+=h) {
        for (j=0, a=A, b=B, c=C, d=D, e=E, f=F, g=G, h=H; j < 64; ) {
            if (j < 16) w[j] = bin[i+j]
            else {
                t1 = w[j-2]
                t2 = w[j-15]
                w[j] = (rotL(t1, 15)^rotL(t1, 13)^t1>>>10) + (w[j-7]|0) + (rotL(t2, 25)^rotL(t2, 14)^t2>>>3) + (w[j-16]|0)
            }

            t1 = (w[j]|0) + h + (rotL(e, 26)^rotL(e, 21)^rotL(e, 7)) + ((e&f)^((~e)&g)) + K[j++]
            t2 = (rotL(a, 30)^rotL(a, 19)^rotL(a, 10)) + ((a&b)^(a&c)^(b&c))

            h = g
            g = f
            f = e
            e = (d + t1)|0
            d = c
            c = b
            b = a
            a = (t1 + t2)|0
        }
    }
    return [A, B, C, D, E, F, G, H]
}

function sha224(data) {
    return intToHex(sha256(data, 0, 1)).slice(0, -8)
}
// TODO end sha224 section, put in module once supported

// TODO begin crc32 section, put in module once supported

// Copyright © 2016–2019 by Alex I. Kuznetsov

// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// Jordan Last has changed the original files licensed under the Apache License

// Apache License
// Version 2.0, January 2004
// http://www.apache.org/licenses/

// TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

// 1. Definitions.

// "License" shall mean the terms and conditions for use, reproduction,
// and distribution as defined by Sections 1 through 9 of this document.

// "Licensor" shall mean the copyright owner or entity authorized by
// the copyright owner that is granting the License.

// "Legal Entity" shall mean the union of the acting entity and all
// other entities that control, are controlled by, or are under common
// control with that entity. For the purposes of this definition,
// "control" means (i) the power, direct or indirect, to cause the
// direction or management of such entity, whether by contract or
// otherwise, or (ii) ownership of fifty percent (50%) or more of the
// outstanding shares, or (iii) beneficial ownership of such entity.

// "You" (or "Your") shall mean an individual or Legal Entity
// exercising permissions granted by this License.

// "Source" form shall mean the preferred form for making modifications,
// including but not limited to software source code, documentation
// source, and configuration files.

// "Object" form shall mean any form resulting from mechanical
// transformation or translation of a Source form, including but
// not limited to compiled object code, generated documentation,
// and conversions to other media types.

// "Work" shall mean the work of authorship, whether in Source or
// Object form, made available under the License, as indicated by a
// copyright notice that is included in or attached to the work
// (an example is provided in the Appendix below).

// "Derivative Works" shall mean any work, whether in Source or Object
// form, that is based on (or derived from) the Work and for which the
// editorial revisions, annotations, elaborations, or other modifications
// represent, as a whole, an original work of authorship. For the purposes
// of this License, Derivative Works shall not include works that remain
// separable from, or merely link (or bind by name) to the interfaces of,
// the Work and Derivative Works thereof.

// "Contribution" shall mean any work of authorship, including
// the original version of the Work and any modifications or additions
// to that Work or Derivative Works thereof, that is intentionally
// submitted to Licensor for inclusion in the Work by the copyright owner
// or by an individual or Legal Entity authorized to submit on behalf of
// the copyright owner. For the purposes of this definition, "submitted"
// means any form of electronic, verbal, or written communication sent
// to the Licensor or its representatives, including but not limited to
// communication on electronic mailing lists, source code control systems,
// and issue tracking systems that are managed by, or on behalf of, the
// Licensor for the purpose of discussing and improving the Work, but
// excluding communication that is conspicuously marked or otherwise
// designated in writing by the copyright owner as "Not a Contribution."

// "Contributor" shall mean Licensor and any individual or Legal Entity
// on behalf of whom a Contribution has been received by Licensor and
// subsequently incorporated within the Work.

// 2. Grant of Copyright License. Subject to the terms and conditions of
// this License, each Contributor hereby grants to You a perpetual,
// worldwide, non-exclusive, no-charge, royalty-free, irrevocable
// copyright license to reproduce, prepare Derivative Works of,
// publicly display, publicly perform, sublicense, and distribute the
// Work and such Derivative Works in Source or Object form.

// 3. Grant of Patent License. Subject to the terms and conditions of
// this License, each Contributor hereby grants to You a perpetual,
// worldwide, non-exclusive, no-charge, royalty-free, irrevocable
// (except as stated in this section) patent license to make, have made,
// use, offer to sell, sell, import, and otherwise transfer the Work,
// where such license applies only to those patent claims licensable
// by such Contributor that are necessarily infringed by their
// Contribution(s) alone or by combination of their Contribution(s)
// with the Work to which such Contribution(s) was submitted. If You
// institute patent litigation against any entity (including a
// cross-claim or counterclaim in a lawsuit) alleging that the Work
// or a Contribution incorporated within the Work constitutes direct
// or contributory patent infringement, then any patent licenses
// granted to You under this License for that Work shall terminate
// as of the date such litigation is filed.

// 4. Redistribution. You may reproduce and distribute copies of the
// Work or Derivative Works thereof in any medium, with or without
// modifications, and in Source or Object form, provided that You
// meet the following conditions:

// (a) You must give any other recipients of the Work or
// Derivative Works a copy of this License; and

// (b) You must cause any modified files to carry prominent notices
// stating that You changed the files; and

// (c) You must retain, in the Source form of any Derivative Works
// that You distribute, all copyright, patent, trademark, and
// attribution notices from the Source form of the Work,
// excluding those notices that do not pertain to any part of
// the Derivative Works; and

// (d) If the Work includes a "NOTICE" text file as part of its
// distribution, then any Derivative Works that You distribute must
// include a readable copy of the attribution notices contained
// within such NOTICE file, excluding those notices that do not
// pertain to any part of the Derivative Works, in at least one
// of the following places: within a NOTICE text file distributed
// as part of the Derivative Works; within the Source form or
// documentation, if provided along with the Derivative Works; or,
// within a display generated by the Derivative Works, if and
// wherever such third-party notices normally appear. The contents
// of the NOTICE file are for informational purposes only and
// do not modify the License. You may add Your own attribution
// notices within Derivative Works that You distribute, alongside
// or as an addendum to the NOTICE text from the Work, provided
// that such additional attribution notices cannot be construed
// as modifying the License.

// You may add Your own copyright statement to Your modifications and
// may provide additional or different license terms and conditions
// for use, reproduction, or distribution of Your modifications, or
// for any such Derivative Works as a whole, provided Your use,
// reproduction, and distribution of the Work otherwise complies with
// the conditions stated in this License.

// 5. Submission of Contributions. Unless You explicitly state otherwise,
// any Contribution intentionally submitted for inclusion in the Work
// by You to the Licensor shall be under the terms and conditions of
// this License, without any additional terms or conditions.
// Notwithstanding the above, nothing herein shall supersede or modify
// the terms of any separate license agreement you may have executed
// with Licensor regarding such Contributions.

// 6. Trademarks. This License does not grant permission to use the trade
// names, trademarks, service marks, or product names of the Licensor,
// except as required for reasonable and customary use in describing the
// origin of the Work and reproducing the content of the NOTICE file.

// 7. Disclaimer of Warranty. Unless required by applicable law or
// agreed to in writing, Licensor provides the Work (and each
// Contributor provides its Contributions) on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
// implied, including, without limitation, any warranties or conditions
// of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
// PARTICULAR PURPOSE. You are solely responsible for determining the
// appropriateness of using or redistributing the Work and assume any
// risks associated with Your exercise of permissions under this License.

// 8. Limitation of Liability. In no event and under no legal theory,
// whether in tort (including negligence), contract, or otherwise,
// unless required by applicable law (such as deliberate and grossly
// negligent acts) or agreed to in writing, shall any Contributor be
// liable to You for damages, including any direct, indirect, special,
// incidental, or consequential damages of any character arising as a
// result of this License or out of the use or inability to use the
// Work (including but not limited to damages for loss of goodwill,
// work stoppage, computer failure or malfunction, or any and all
// other commercial damages or losses), even if such Contributor
// has been advised of the possibility of such damages.

// 9. Accepting Warranty or Additional Liability. While redistributing
// the Work or Derivative Works thereof, You may choose to offer,
// and charge a fee for, acceptance of support, warranty, indemnity,
// or other liability obligations and/or rights consistent with this
// License. However, in accepting such obligations, You may act only
// on Your own behalf and on Your sole responsibility, not on behalf
// of any other Contributor, and only if You agree to indemnify,
// defend, and hold each Contributor harmless for any liability
// incurred by, or claims asserted against, such Contributor by reason
// of your accepting any such warranty or additional liability.

// END OF TERMS AND CONDITIONS

// APPENDIX: How to apply the Apache License to your work.

// To apply the Apache License to your work, attach the following
// boilerplate notice, with the fields enclosed by brackets "[]"
// replaced with your own identifying information. (Don't include
// the brackets!)  The text should be enclosed in the appropriate
// comment syntax for the file format. We also recommend that a
// file or class name and description of purpose be included on the
// same "printed page" as the copyright notice for easier
// identification within third-party archives.

// Copyright 2020 DFINITY LLC.

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// https://github.com/dfinity/agent-js/blob/90b073dc735bfae9f3b1c7fc537bd97347c5cc68/packages/principal/src/utils/getCrc.ts
// This file is translated to JavaScript from
// https://lxp32.github.io/docs/a-simple-example-crc32-calculation/
const lookUpTable: Uint32Array = new Uint32Array([
    0x00000000, 0x77073096, 0xee0e612c, 0x990951ba, 0x076dc419, 0x706af48f, 0xe963a535, 0x9e6495a3,
    0x0edb8832, 0x79dcb8a4, 0xe0d5e91e, 0x97d2d988, 0x09b64c2b, 0x7eb17cbd, 0xe7b82d07, 0x90bf1d91,
    0x1db71064, 0x6ab020f2, 0xf3b97148, 0x84be41de, 0x1adad47d, 0x6ddde4eb, 0xf4d4b551, 0x83d385c7,
    0x136c9856, 0x646ba8c0, 0xfd62f97a, 0x8a65c9ec, 0x14015c4f, 0x63066cd9, 0xfa0f3d63, 0x8d080df5,
    0x3b6e20c8, 0x4c69105e, 0xd56041e4, 0xa2677172, 0x3c03e4d1, 0x4b04d447, 0xd20d85fd, 0xa50ab56b,
    0x35b5a8fa, 0x42b2986c, 0xdbbbc9d6, 0xacbcf940, 0x32d86ce3, 0x45df5c75, 0xdcd60dcf, 0xabd13d59,
    0x26d930ac, 0x51de003a, 0xc8d75180, 0xbfd06116, 0x21b4f4b5, 0x56b3c423, 0xcfba9599, 0xb8bda50f,
    0x2802b89e, 0x5f058808, 0xc60cd9b2, 0xb10be924, 0x2f6f7c87, 0x58684c11, 0xc1611dab, 0xb6662d3d,
    0x76dc4190, 0x01db7106, 0x98d220bc, 0xefd5102a, 0x71b18589, 0x06b6b51f, 0x9fbfe4a5, 0xe8b8d433,
    0x7807c9a2, 0x0f00f934, 0x9609a88e, 0xe10e9818, 0x7f6a0dbb, 0x086d3d2d, 0x91646c97, 0xe6635c01,
    0x6b6b51f4, 0x1c6c6162, 0x856530d8, 0xf262004e, 0x6c0695ed, 0x1b01a57b, 0x8208f4c1, 0xf50fc457,
    0x65b0d9c6, 0x12b7e950, 0x8bbeb8ea, 0xfcb9887c, 0x62dd1ddf, 0x15da2d49, 0x8cd37cf3, 0xfbd44c65,
    0x4db26158, 0x3ab551ce, 0xa3bc0074, 0xd4bb30e2, 0x4adfa541, 0x3dd895d7, 0xa4d1c46d, 0xd3d6f4fb,
    0x4369e96a, 0x346ed9fc, 0xad678846, 0xda60b8d0, 0x44042d73, 0x33031de5, 0xaa0a4c5f, 0xdd0d7cc9,
    0x5005713c, 0x270241aa, 0xbe0b1010, 0xc90c2086, 0x5768b525, 0x206f85b3, 0xb966d409, 0xce61e49f,
    0x5edef90e, 0x29d9c998, 0xb0d09822, 0xc7d7a8b4, 0x59b33d17, 0x2eb40d81, 0xb7bd5c3b, 0xc0ba6cad,
    0xedb88320, 0x9abfb3b6, 0x03b6e20c, 0x74b1d29a, 0xead54739, 0x9dd277af, 0x04db2615, 0x73dc1683,
    0xe3630b12, 0x94643b84, 0x0d6d6a3e, 0x7a6a5aa8, 0xe40ecf0b, 0x9309ff9d, 0x0a00ae27, 0x7d079eb1,
    0xf00f9344, 0x8708a3d2, 0x1e01f268, 0x6906c2fe, 0xf762575d, 0x806567cb, 0x196c3671, 0x6e6b06e7,
    0xfed41b76, 0x89d32be0, 0x10da7a5a, 0x67dd4acc, 0xf9b9df6f, 0x8ebeeff9, 0x17b7be43, 0x60b08ed5,
    0xd6d6a3e8, 0xa1d1937e, 0x38d8c2c4, 0x4fdff252, 0xd1bb67f1, 0xa6bc5767, 0x3fb506dd, 0x48b2364b,
    0xd80d2bda, 0xaf0a1b4c, 0x36034af6, 0x41047a60, 0xdf60efc3, 0xa867df55, 0x316e8eef, 0x4669be79,
    0xcb61b38c, 0xbc66831a, 0x256fd2a0, 0x5268e236, 0xcc0c7795, 0xbb0b4703, 0x220216b9, 0x5505262f,
    0xc5ba3bbe, 0xb2bd0b28, 0x2bb45a92, 0x5cb36a04, 0xc2d7ffa7, 0xb5d0cf31, 0x2cd99e8b, 0x5bdeae1d,
    0x9b64c2b0, 0xec63f226, 0x756aa39c, 0x026d930a, 0x9c0906a9, 0xeb0e363f, 0x72076785, 0x05005713,
    0x95bf4a82, 0xe2b87a14, 0x7bb12bae, 0x0cb61b38, 0x92d28e9b, 0xe5d5be0d, 0x7cdcefb7, 0x0bdbdf21,
    0x86d3d2d4, 0xf1d4e242, 0x68ddb3f8, 0x1fda836e, 0x81be16cd, 0xf6b9265b, 0x6fb077e1, 0x18b74777,
    0x88085ae6, 0xff0f6a70, 0x66063bca, 0x11010b5c, 0x8f659eff, 0xf862ae69, 0x616bffd3, 0x166ccf45,
    0xa00ae278, 0xd70dd2ee, 0x4e048354, 0x3903b3c2, 0xa7672661, 0xd06016f7, 0x4969474d, 0x3e6e77db,
    0xaed16a4a, 0xd9d65adc, 0x40df0b66, 0x37d83bf0, 0xa9bcae53, 0xdebb9ec5, 0x47b2cf7f, 0x30b5ffe9,
    0xbdbdf21c, 0xcabac28a, 0x53b39330, 0x24b4a3a6, 0xbad03605, 0xcdd70693, 0x54de5729, 0x23d967bf,
    0xb3667a2e, 0xc4614ab8, 0x5d681b02, 0x2a6f2b94, 0xb40bbe37, 0xc30c8ea1, 0x5a05df1b, 0x2d02ef8d,
  ]);
  
  /**
   * Calculate the CRC32 of an ArrayBufferLike.
   * @param buf The BufferLike to calculate the CRC32 of.
   */
  export function crc32(buf: ArrayBufferLike): string {
    const b = new Uint8Array(buf);
    let crc = -1;
  
    // tslint:disable-next-line:prefer-for-of
    for (let i = 0; i < b.length; i++) {
      const byte = b[i];
      const t = (byte ^ crc) & 0xff;
      crc = lookUpTable[t] ^ (crc >>> 8);
    }
  
    return ((crc ^ -1) >>> 0).toString(16).padStart(8, '0');
  }

// TODO end crc32 section, put in module once supported