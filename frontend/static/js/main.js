const backendURL = "https://docuinfo-backend.vercel.app";
//const backendURL = "https://127.0.0.1:5000";
// File upload and preview functionality
function uploadFile() {
    const fileInput = document.getElementById('documentFile');
    const file = fileInput.files[0];
    //const preview = document.getElementById('pdfPreview');
    const iframe = document.getElementById('pdfViewer');

    if (!file) {
        alert('Please select a file first');
        return;
    }
    // Generate a local preview URL before uploading
    const localPreviewUrl = URL.createObjectURL(file);
    if (iframe) {
        iframe.src = localPreviewUrl; // Set local preview
    } else {
        console.error('iframe not found');
        return;
    }
    const formData = new FormData();
    formData.append('file', file);

    //fetch(`/api/upload`, { // Updated to point to the backend API
    fetch(`${backendURL}/api/upload`, { // Updated to point to the backend API
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(data => {
        console.log('Upload response:', data);
        if (data.error) {
            throw new Error(data.error);
        }

        // Keep the local preview visible
        const preview = document.getElementById('pdfPreview');
        if (preview) {
            preview.innerHTML = ''; // Clear any messages
            preview.appendChild(iframe); // Ensure iframe stays visible
        }
        alert(data.message); // Display success message
    })
    .catch(error => {
        console.error('Error:', error);
        alert(`Error uploading file: ${error.message}`);
    });
}

function showPdfPreview(file) {
    const preview = document.getElementById('pdfPreview');
    
    if (file && file.type === "application/pdf") {
        const objectUrl = URL.createObjectURL(file);
        preview.innerHTML = `
            <embed 
                src="${objectUrl}#page=1&view=FitH"
                type="application/pdf"
                width="100%"
                height="100%"
            />
        `;
    } else {
        preview.innerHTML = '<p>Please select a PDF file</p>';
    }
}

// Remove the change event listener that was showing preview on selection
// Only show preview after successful upload
document.addEventListener('DOMContentLoaded', function () {
    const fileInput = document.getElementById('documentFile');
    fileInput.addEventListener('change', function (event) {
        const file = event.target.files[0];
        const iframe = document.getElementById('pdfViewer');
        
        if (file && file.type === 'application/pdf') {
            const fileURL = URL.createObjectURL(file);
            if (iframe) {
                iframe.src = fileURL; // Set initial preview
            } else {
                console.error('iframe not found');
            }
        } else {
            alert('Please select a valid PDF file.');
        }
    });
});

// Question handling
async function askQuestion() {
    const question = document.getElementById('question').value.toLowerCase();
    if (!question.trim()) {
        alert('Please enter a question');
        return;
    }
    
    const response = document.getElementById('response');
    response.innerHTML = `
    <div class="spinner-container">
        <div class="spinner"></div>
            <div class="spinner-text">Generating answer...</div>
        </div>
    `;
    
    try {
        const result = await fetch(`${backendURL}/api/ask`, { // Updated to point to the backend API
        //const result = await fetch(`/api/ask`, { // Updated to point to the backend API
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ question: question })
        });
        const data = await result.json();
        
        if (data.answer) {
            // Check if question is API-related
            const isApiRelated = question.includes('api') || 
                               question.includes('endpoint') || 
                               question.includes('http') || 
                               question.includes('request') ||
                               question.includes('method');
            
            if (isApiRelated) {
                formatJsonResponse(data.answer, response);
            } else {
                formatTextResponse(data.answer, response);
            }
        } else {
            response.innerHTML = 'No answer received';
        }
        
        // Add new question button
        addNewQuestionButton(response);
        
    } catch (error) {
        response.innerHTML = 'Error: ' + error.message;
    }
}

function formatJsonResponse(answer, responseElement) {
    try {
        let cleanAnswer = answer.replace(/```json\n|\n```/g, '');
        const jsonObj = JSON.parse(cleanAnswer);
        responseElement.innerHTML = `
            <div class="json-container">
                <h3>API Documentation</h3>
                <pre class="json-response">${JSON.stringify(jsonObj, null, 2)}</pre>
            </div>
        `;
    } catch (e) {
        responseElement.innerHTML = answer;
    }
}

function formatTextResponse(text, responseElement) {
    let formattedHtml = '<div class="text-response">';
    
    // Split text into paragraphs
    const paragraphs = text.split(/\d+\.\s+/);
    
    if (paragraphs.length > 1) {
        // Numbered list format
        formattedHtml += '<div class="numbered-list">';
        paragraphs.forEach((para, index) => {
            if (para.trim()) {
                formattedHtml += `
                    <div class="list-item">
                        <span class="number">${index}</span>
                        <div class="content">${formatParagraph(para)}</div>
                    </div>
                `;
            }
        });
        formattedHtml += '</div>';
    } else {
        // Regular paragraph format
        formattedHtml += formatParagraph(text);
    }
    
    formattedHtml += '</div>';
    responseElement.innerHTML = formattedHtml;
}

function formatParagraph(text) {
    // Format bold text
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Format italic text
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    return text;
}

function addNewQuestionButton(responseElement) {
    const button = document.createElement('button');
    button.id = 'newQuestionBtn';
    button.className = 'new-question-btn';
    button.textContent = 'New Question';
    button.addEventListener('click', () => {
        document.getElementById('question').value = '';
        responseElement.innerHTML = '';
    });
    responseElement.appendChild(button);
}

// Event listeners
document.getElementById('askButton').addEventListener('click', askQuestion);
document.getElementById('question').addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        askQuestion();
    }
});