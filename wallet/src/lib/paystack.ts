/** Checkout URLs come from authenticated backend initialization, never user input. */
export function validatedCheckoutUrl(value:string,provider:'paystack'|'flutterwave'='paystack'):string {
 const url=new URL(value);
 if(url.origin!==(provider==='flutterwave'?'https://checkout.flutterwave.com':'https://checkout.paystack.com')||url.username||url.password)throw new Error('Invalid payment checkout URL.');
 return url.href;
}
