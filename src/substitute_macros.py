
doreplacement = False

keywords = map(lambda s: r'"%s"' % s, "comma function function_token variable node number operator operator_token property_access paren string".split(' '))
special_props = {
  "type": "t", "index": "i", "endIndex": "e", "value": "v", "contents": "o", "children": "c", "paren": "p", "parenInfo": "a", "name": "n", "verticalBar": "b", "implicit": "m", "opening": "g", "op": "k", "parenType": "y", "prop": "r", "pID": "d"
}

def substitute_keywords(string):
    for i, kw in enumerate(keywords):
        string = string.replace(kw, str(i))

    for key, value in special_props.items():
        string = string.replace("%s:" % key, "%s:" % value).replace(".%s" % key, ".%s" % value)

    return string

files = map(lambda s: s + ".source.js", ["expression_tokenizer", "parse_string"])

for file in files:
    outfile = file.replace("source.js", "js")

    text = open(file, "r").read()

    replaced_text = substitute_keywords(text) if doreplacement else text

    out = open(outfile, "w")
    out.write(replaced_text)

    out.close()

open("expression_tokenizer.js", "a").write("""\nexport const tokenEnum = [%s]""" % ','.join(keywords))
