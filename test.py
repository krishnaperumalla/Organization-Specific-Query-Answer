from sentence_transformers import SentenceTransformer

model = SentenceTransformer("./my_bert_model")
print(model.encode(["hello world"]))