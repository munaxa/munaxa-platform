import asyncio, json, re, sys, ast, time, datetime, collections
src=open(sys.argv[1]).read()
c8_src=src[src.index('OPERATOR_EMAIL = "<OWNER'):src.index('result = await c8()')]
class ClientError(Exception):
    def __init__(s,code,msg): super().__init__(msg); s.response={"Error":{"Code":code,"Message":msg}}
# SYNTHETIC TEST VALUE, not a credential: used only to prove the C-8 return never contains it.
PW="Synthetic-Value-9f3K!x2LmQ7#vR4tZ8pW1nB6yD0cH5j"
def make(fail=None, exists=False, gen_bad=0):
    st={"calls":[], "gen":0, "store":{}}
    async def call_boto3(service_name, operation_name, region_name=None, params=None):
        st["calls"].append(operation_name)
        if operation_name=="DescribeSecret":
            if exists: return {"Name":params["SecretId"]}
            raise ClientError("ResourceNotFoundException","Secrets Manager can't find the specified secret.")
        if operation_name=="GetRandomPassword":
            st["gen"]+=1
            return {"RandomPassword": ("qwerty"+PW[6:]) if st["gen"]<=gen_bad else PW}
        if operation_name=="CreateSecret":
            if fail==params["Name"]: raise ClientError("ValidationException", "Value '%s' at 'secretString' failed" % params["SecretString"])
            st["store"][params["Name"]]=params["SecretString"]; return {"Name":params["Name"],"ARN":"arn:x:"+params["Name"]+"-AbCdEf","VersionId":"v1"}
        if operation_name=="DeleteSecret":
            st["store"].pop(params["SecretId"],None); return {}
    return call_boto3, st
async def run(**kw):
    cb,st=make(**kw); g={"json":json,"ClientError":ClientError,"call_boto3":cb}
    exec(c8_src.replace('"<OWNER-SUPPLIED-TESTING-EMAIL>"','"operator.test@example.com"'), g)
    r=await g["c8"](); out=json.dumps(r)
    leak = PW in out or PW[6:] in out or "example.com" in out
    return r, leak, st
for name,kw in [("happy",{}),("persistent fails",{"fail":"munaxa-nonprod/identity-operator"}),("bootstrap fails",{"fail":"munaxa-nonprod/identity-bootstrap"}),("name exists",{"exists":True}),("policy regen",{"gen_bad":2}),("policy exhausted",{"gen_bad":3})]:
    r,leak,st=asyncio.run(run(**kw))
    print(f"{name:18} result={r.get('result')} code={r.get('code')} rolled={r.get('persistent_rolled_back')} leak={leak} stored={sorted(st['store'])} calls={st['calls']}")
    if name=="happy":
        b=json.loads(st['store']['munaxa-nonprod/identity-bootstrap']); p=json.loads(st['store']['munaxa-nonprod/identity-operator'])
        print("  bootstrap keys",sorted(b),"same pw",b['IDENTITY_OWNER_PASSWORD']==p['IDENTITY_OWNER_PASSWORD']==PW)
# email placeholder guard
g={"json":json,"ClientError":ClientError,"call_boto3":make()[0]}; exec(c8_src,g); print("placeholder:",asyncio.run(g["c8"]()))
