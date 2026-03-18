import os
import logging
import time
import uuid
from typing import List, Dict, Any
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from werkzeug.utils import secure_filename
import google.generativeai as genai
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader, TextLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.schema import Document
from langchain.prompts import PromptTemplate
from pinecone import Pinecone, ServerlessSpec
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)
load_dotenv()

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'pdf', 'docx', 'txt'}
MAX_FILE_SIZE = 50 * 1024 * 1024

CHUNK_SIZE = 500
CHUNK_OVERLAP = 50
MAX_RELEVANT_CHUNKS = 4
RETRIEVAL_K = 4

PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "orgquery-index")
PINECONE_ENVIRONMENT = os.getenv("PINECONE_ENVIRONMENT", "us-east-1")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE
CORS(app)



os.makedirs(UPLOAD_FOLDER, exist_ok=True)

embeddings_model = None
llm = None
pc = None
pinecone_index = None
document_metadata = {}


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def initialize_models():
    global embeddings_model, llm, pc, pinecone_index

    genai.configure(api_key=GOOGLE_API_KEY)
    embeddings_model = True
    logger.info("Google embeddings ready")

    llm = ChatGoogleGenerativeAI(
        model="gemini-3-flash-preview",
        google_api_key=GOOGLE_API_KEY,
        temperature=0.1,
        max_output_tokens=800,
        convert_system_message_to_human=True
    )
    logger.info("LLM initialized")

    pc = Pinecone(api_key=PINECONE_API_KEY)

    if PINECONE_INDEX_NAME not in pc.list_indexes().names():
        pc.create_index(
            name=PINECONE_INDEX_NAME,
            dimension=3072,
            metric="cosine",
            spec=ServerlessSpec(cloud="aws", region=PINECONE_ENVIRONMENT)
        )

    pinecone_index = pc.Index(PINECONE_INDEX_NAME)
    logger.info("Pinecone initialized")
initialize_models()

def load_document(file_path: str) -> List[Document]:
    try:
        file_extension = file_path.rsplit('.', 1)[1].lower()

        if file_extension == 'pdf':
            loader = PyPDFLoader(file_path)
        elif file_extension == 'docx':
            loader = Docx2txtLoader(file_path)
        elif file_extension == 'txt':
            loader = TextLoader(file_path)
        else:
            return []

        return loader.load()
    except Exception as e:
        logger.error(f"Error loading document: {e}")
        return []


def split_documents(documents: List[Document]) -> List[Document]:
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        length_function=len,
        separators=["\n\n", "\n", ". ", " ", ""]
    )
    return text_splitter.split_documents(documents)


def get_embeddings(texts: List[str]):
    embeddings = []
    for text in texts:
        response = genai.embed_content(
            model="models/gemini-embedding-001",   # YES — go back to this
            content=text,
            task_type="retrieval_document"
        )
        embeddings.append(response["embedding"])
    return embeddings


def query_pinecone(question: str, session_id: str, top_k: int = RETRIEVAL_K) -> List[Dict[str, Any]]:
    try:
        result = genai.embed_content(
            model="models/gemini-embedding-001",
            content=question,
            task_type="retrieval_query"
        )
        query_embedding = result["embedding"]

        results = pinecone_index.query(
            vector=query_embedding,
            top_k=top_k,
            namespace=session_id,
            include_metadata=True
        )

        relevant_docs = []
        for match in results['matches']:
            relevant_docs.append({
                'page_content': match['metadata']['text'],
                'score': float(match['score']),
                'metadata': {
                    'source_file': match['metadata'].get('source_file', 'unknown'),
                    'score': float(match['score'])
                }
            })

        return relevant_docs
    except Exception as e:
        logger.error(f"Error querying Pinecone: {e}")
        return []


def cleanup_pinecone_session(session_id: str):
    try:
        pinecone_index.delete(namespace=session_id, delete_all=True)
    except Exception as e:
        logger.error(f"Error cleaning up namespace: {e}")


def get_prompt_template() -> str:
    return """You are an expert data analyst for an organization's document intelligence system. Provide a direct, detailed answer based on the context.

Question: {question}

Context:
{context}

Instructions:
1. Provide a comprehensive answer based ONLY on the information in the context
2. Include specific details like amounts, percentages, dates, conditions, and requirements
3. If the information mentions organizational policies, departments, or processes, include them
4. Be precise and detailed in your explanation
5. Do NOT mention sources, file names, or relevance scores
6. Do NOT say "according to the context" or "the document states"
7. Answer directly as if you are the organization's information system
8. Keep the response clear and well-structured
9. If exact information is not available, state that clearly

Answer:"""


def generate_answer(question: str, relevant_docs: List[Dict[str, Any]]) -> str:
    if not relevant_docs:
        return "No relevant information found in the documents."

    context = "\n\n".join([doc['page_content'] for doc in relevant_docs])
    prompt_template = get_prompt_template()
    prompt = PromptTemplate(template=prompt_template, input_variables=["question", "context"])
    formatted_prompt = prompt.format(question=question, context=context)

    try:
        response = llm.invoke(formatted_prompt)
        return response.content.strip() if hasattr(response, 'content') else str(response).strip()
    except Exception as e:
        logger.error(f"Error generating answer: {e}")
        return f"Error generating answer: {str(e)}"


@app.route('/')
def home():
    return render_template('index.html')


@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'embeddings_loaded': embeddings_model is not None,
        'llm_loaded': llm is not None,
        'pinecone_connected': pinecone_index is not None,
        'documents_loaded': len(document_metadata)
    })


@app.route('/upload', methods=['POST'])
def upload_document():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type. Allowed: PDF, DOCX, TXT'}), 400

    try:
        filename = secure_filename(file.filename)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)

        documents = load_document(file_path)

        if not documents:
            return jsonify({'error': 'Failed to load document'}), 500

        chunks = split_documents(documents)

        if not chunks:
            return jsonify({'error': 'No content extracted from document'}), 500

        session_id = str(uuid.uuid4())
        doc_id = session_id

        chunk_texts = [chunk.page_content for chunk in chunks]
        embeddings = get_embeddings(chunk_texts)

        vectors = []
        for idx, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            vectors.append({
                "id": f"{session_id}_{idx}",
                "values": embedding,
                "metadata": {
                    "session_id": session_id,
                    "text": chunk.page_content[:1000],
                    "chunk_index": idx,
                    "source_file": chunk.metadata.get('source', 'unknown')
                }
            })

        batch_size = 100
        for i in range(0, len(vectors), batch_size):
            pinecone_index.upsert(vectors=vectors[i:i + batch_size], namespace=session_id)

        document_metadata[doc_id] = {
            'filename': filename,
            'session_id': session_id,
            'chunks_count': len(chunks),
            'upload_time': time.time()
        }

        os.remove(file_path)

        return jsonify({
            'success': True,
            'doc_id': doc_id,
            'filename': filename,
            'chunks_count': len(chunks)
        })

    except Exception as e:
        logger.error(f"Error uploading document: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/query', methods=['POST'])
def query_document():
    data = request.get_json()

    if not data or 'query' not in data or 'doc_id' not in data:
        return jsonify({'error': 'Missing query or doc_id'}), 400

    query = data['query']
    doc_id = data['doc_id']

    if doc_id not in document_metadata:
        return jsonify({'error': 'Document not found'}), 404

    try:
        start_time = time.time()
        session_id = document_metadata[doc_id]['session_id']
        relevant_docs = query_pinecone(query, session_id)

        if not relevant_docs:
            return jsonify({
                'answer': 'No relevant information found.',
                'processing_time': time.time() - start_time
            })

        answer = generate_answer(query, relevant_docs)

        return jsonify({
            'answer': answer,
            'processing_time': time.time() - start_time
        })

    except Exception as e:
        logger.error(f"Error processing query: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/documents', methods=['GET'])
def list_documents():
    return jsonify({
        'documents': [
            {
                'doc_id': doc_id,
                'filename': metadata['filename'],
                'chunks_count': metadata['chunks_count']
            }
            for doc_id, metadata in document_metadata.items()
        ]
    })


@app.route('/delete/<doc_id>', methods=['DELETE'])
def delete_document(doc_id):
    try:
        if doc_id in document_metadata:
            session_id = document_metadata[doc_id]['session_id']
            cleanup_pinecone_session(session_id)
            del document_metadata[doc_id]
            return jsonify({'success': True})
        else:
            return jsonify({'error': 'Document not found'}), 404
    except Exception as e:
        logger.error(f"Error deleting document: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)