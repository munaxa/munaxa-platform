import sys,re
t=open(sys.argv[1]).read()
for m in re.finditer(r'DUMP-([A-Z]+)(.*?)ENDDUMP', t, re.S):
    body=re.sub(r'\n[ │]*', '', m.group(2))  # undo terraform's line wrapping
    print(m.group(1), body)
