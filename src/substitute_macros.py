
keywords = map(lambda s: r'"%s"' % s, "comma function function_token variable node number operator operator_token property_access paren".split(' '))

def substitute_keywords(string):
    for i, kw in keywords:
        string = string.replace(kw, str(i))

files = ["expression_tokenizer", "parse_string"]

for file in files:
    outfile = file.replace("source.js", "js")

    text = open(file, "r").read()

    replaced_text = substitute_keywords(text)

    open(outfile, "w").write(replaced_text)
