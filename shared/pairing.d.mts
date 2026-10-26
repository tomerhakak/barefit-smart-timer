export function parsePairQr(raw: string): {base:string;room:string;code:string;studioId:string;qrToken?:string};
export function pairLink(base:string, code:{room:string;code:string;qrToken?:string}, studioId?:string):string;
