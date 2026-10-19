/** Only fixed, operator-safe errors cross the API boundary. */
export class Failure extends Error {
  constructor(readonly status:number,readonly code:string,message:string){super(message);}
}
