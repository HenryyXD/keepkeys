# Renders docs/demo.gif:  vhs docs/demo.tape   (run from the repository root, on Windows)
Output docs/demo.gif

Set Shell "powershell"
Set FontSize 16
Set Width 1340
Set Height 520
Set Padding 24
Set Theme "GitHub Dark"
Set TypingSpeed 35ms
Set WindowBar Colorful

Hide
Type ". .\docs\demo-setup.ps1"
Enter
Sleep 1s
Show

Type "# agent: I need STRIPE_SECRET_KEY. Paste it here, not in the chat."
Sleep 1.2s
Enter
Type "keepkeys add STRIPE_SECRET_KEY"
Sleep 600ms
Enter
Sleep 1.5s

# The person copies the key from the Stripe dashboard and presses Ctrl+V.
Copy "sk_test_DEMO0000000000000000000000004242"
Paste
Sleep 2.5s

Type "keepkeys list"
Enter
Sleep 2s
Type "Get-Content .gitignore"
Enter
Sleep 3s
