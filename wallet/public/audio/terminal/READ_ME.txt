PAYBYPALM TERMINAL AUDIO

15 separate WAV files, one per event or instruction.
Mono, 24 kHz, 16-bit PCM.

Play ready.wav when a payment session begins. Play only the positional guidance needed. scan_complete.wav means the palm has been captured, NOT that payment succeeded.

success.wav contains the plucked-string/drum cue followed by the female voice saying Payment successful. Play it only after confirmed payment approval, once per transaction.

payment_pending.wav is for an unknown result. Do not announce failure or invite another charge until the payment status is resolved.

Do not play all files in sequence. Suppress obsolete prompts and never overlap speech.

These prototype files need audition on your terminal speaker. File integrity checks do not establish pronunciation, audibility or real-world usability.

Repository integration: the supplied success recording is named success1.wav.
The payment-success mapping uses that exact file; there is no success.wav here.
Source: the operator-supplied PayByPalm_Terminal_Audio folder. See pi/AUDIO.md.
