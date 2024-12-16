import openai
from flask import Flask, request, jsonify, render_template
from werkzeug.utils import secure_filename
import os
from PyPDF2 import PdfReader  # Corrected import statement
from dotenv import load_dotenv
from openai import OpenAI
from flask_cors import CORS

app = Flask(__name__)

#CORS(app)
CORS(app, resources={r"/*": {"origins": "https://docuinfo-frontend.vercel.app"}})

UPLOAD_FOLDER = '/tmp/uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB limit

ALLOWED_EXTENSIONS = {'pdf', 'txt', 'doc', 'docx'}

# Load the environment variables from the openai.env file
load_dotenv(os.path.join(os.path.dirname(__file__), 'openai.env'))
client = OpenAI(
  api_key=os.environ['OPENAI_API_KEY'],  # this is also the default, it can be omitted
)


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def read_pdf(file_path):
    reader = PdfReader(file_path)
    docs = []
    for page_num, page in enumerate(reader.pages):
        try:
            text = page.extract_text()
            if text and text.strip():  # Only add pages with extractable text
                docs.append({
                    'content': text,
                    'meta': {"page": page_num + 1}
                })
        except Exception as e:
            raise RuntimeError(f"Error reading page {page_num + 1}: {e}")
    return docs

def encode_sentences(sentences):
    # Ensure sentences is a list
    if isinstance(sentences, str):
        sentences = [sentences]
    # Call the embeddings API
    response = client.embeddings.create(
        input=sentences,
        model="text-embedding-ada-002"
    )
    embeddings = [item.embedding for item in response.data]
    return embeddings

try:
    current_directory = os.getcwd()
    print(f"Current working directory: {current_directory}")
except PermissionError as e:
    print(f"PermissionError: {e}. Unable to access the current working directory.")
    # Handle the error, e.g., by setting a default directory or exiting the script

print(f"Templates folder absolute path: {os.path.abspath('templates')}")


# Global variables to store documents and embeddings
documents = []
document_embeddings = []

@app.route('/')
def home():
    try:
        return render_template('index.html')  # Looks for index.html in templates folder
    except Exception as e:
        print(f"Error rendering template: {e}")
        return f"Error: {e}", 500

@app.route('/api/ask', methods=['POST'])
def ask():
    try:
        global documents, document_embeddings  # Declare globals
        data = request.json
        question = data.get('question')

        if not question:
            return jsonify({'error': 'No question provided'}), 400

        if not documents or len(document_embeddings) == 0:
            return jsonify({'error': 'No document embeddings available. Upload a document first.'}), 400

        question_embedding = encode_sentences(question)[0]
        print(f"Question embedding: {question_embedding}")

        # Calculate cosine similarity
        def cosine_similarity(a, b):
            dot_product = sum(i * j for i, j in zip(a, b))
            norm_a = sum(i * i for i in a) ** 0.5
            norm_b = sum(i * i for i in b) ** 0.5
            if norm_a == 0 or norm_b == 0:
                return 0
            return dot_product / (norm_a * norm_b)

        similarities = [cosine_similarity(doc_emb, question_embedding) for doc_emb in document_embeddings]
        top_indices = sorted(range(len(similarities)), key=lambda i: similarities[i], reverse=True)[:5]
        context = "\n\n".join([documents[i]['content'] for i in top_indices])

        # Construct the prompt
        prompt = f"""
You are an expert in answering questions about the documentation provided.
When the question is about APIs, endpoints, parameters, tokens, or HTTP methods (GET, POST, etc.),
you MUST respond in JSON format with the following structure:
{{
    "endpoint": "/api/v1/example",
    "method": "POST",
    "parameters": {{
        "required": ["param1", "param2"],
        "optional": ["param3"]
    }},
    "description": "Brief description of the endpoint"
}}
and add an example if available.

For non-API questions, respond in plain text.

Do not hallucinate!!! 
Do not make up factual information!!!

Context:
{context}

Question: {question}
Answer:
"""
        # Call OpenAI API
        response = client.chat.completions.create(
            model="o1-mini",
            messages=[
                {"role": "user", "content": prompt}
            ]
        )
        answer = response.choices[0].message.content
        return jsonify({'answer': answer})
    except Exception as e:
        print(f"Error in /api/ask: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload', methods=['POST'])
def upload_file():
    print("Incoming Headers:", request.headers)
    print("Incoming Files:", request.files)
    if 'file' not in request.files:
        print("No file part in the request.")
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']
    if file.filename == '':
        print("No file selected.")
        return jsonify({'error': 'No selected file'}), 400

    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)
        print(f"File saved successfully: {file_path}")
        try:
            global documents, document_embeddings  # Declare globals
            documents = read_pdf(file_path)
            contents = [doc['content'] for doc in documents]
            document_embeddings = encode_sentences(contents)
            return jsonify({'message': 'File uploaded and processed successfully','file_url': file_path}), 200
        except Exception as e:
            # Print the exception for debugging purposes
            print(f"Error in /api/upload: {e}")
            return jsonify({'error': f'Error processing file: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(debug=False)