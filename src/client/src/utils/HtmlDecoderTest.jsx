import React, { useState } from 'react';
import Card from '../components/common/Card';
import { decodeHtmlEntities, sanitizeText } from './htmlUtils';

/**
 * Test component to verify HTML entity decoding works correctly
 * You can add this to a development route for testing
 */
const HtmlDecoderTest = () => {
  const [inputText, setInputText] = useState('Oil &amp; Filter Change');
  const [decodedText, setDecodedText] = useState('');

  const handleTestDecoding = () => {
    const result = sanitizeText(inputText);
    setDecodedText(result);
  };

  const testCases = [
    { input: 'Oil &amp; Filter Change', expected: 'Oil & Filter Change' },
    { input: 'Less than &lt; greater than &gt;', expected: 'Less than < greater than >' },
    { input: 'Quote: &quot;Hello&quot;', expected: 'Quote: "Hello"' },
    { input: 'A &amp;amp; B (double encoded)', expected: 'A & B (double encoded)' },
    { input: 'Don&apos;t worry', expected: 'Don\'t worry' },
    { input: 'BRAKE &amp; TIRE SHOP - Wheel &amp; Alignment Center', expected: 'BRAKE & TIRE SHOP - Wheel & Alignment Center' }
  ];

  return (
    <Card title="HTML Entity Decoder Test">
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium mb-2">Test Your Text</h3>
          <div className="flex space-x-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-grow p-2 border rounded"
              placeholder="Enter text with HTML entities"
            />
            <button
              onClick={handleTestDecoding}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Decode
            </button>
          </div>
          
          {decodedText && (
            <div className="mt-4 p-3 border rounded bg-gray-50">
              <p><strong>Result:</strong> {decodedText}</p>
            </div>
          )}
        </div>
        
        <div>
          <h3 className="text-lg font-medium mb-2">Test Cases</h3>
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-4 py-2 text-left">Input</th>
                <th className="px-4 py-2 text-left">Expected Output</th>
                <th className="px-4 py-2 text-left">Actual Output</th>
                <th className="px-4 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {testCases.map((testCase, index) => {
                const actualOutput = sanitizeText(testCase.input);
                const success = actualOutput === testCase.expected;
                
                return (
                  <tr key={index}>
                    <td className="px-4 py-2 font-mono text-sm">{testCase.input}</td>
                    <td className="px-4 py-2">{testCase.expected}</td>
                    <td className="px-4 py-2">{actualOutput}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs ${success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {success ? 'PASS' : 'FAIL'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
};

export default HtmlDecoderTest;