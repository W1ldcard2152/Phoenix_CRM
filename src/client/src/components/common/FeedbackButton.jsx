import React, { useState, useEffect } from 'react';
import SelectInput from './SelectInput';
import TextArea from './TextArea';
import Button from './Button';
import technicianService from '../../services/technicianService';
import { Link } from 'react-router-dom'; // Import Link
import feedbackService from '../../services/feedbackService';

const FeedbackButton = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [technicians, setTechnicians] = useState([]);
  const [feedbackData, setFeedbackData] = useState({
    user: '',
    feedbackText: '',
  });
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(''); // 'success' or 'error'

  useEffect(() => {
    const fetchTechnicians = async () => {
      try {
        const response = await technicianService.getAllTechnicians();
        setTechnicians(response.data.data.technicians.map(tech => ({
          value: tech._id,
          label: tech.name
        })));
      } catch (error) {
        console.error('Error fetching technicians:', error);
        setMessage('Failed to load technicians.');
        setMessageType('error');
      }
    };
    fetchTechnicians();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFeedbackData(prevData => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setMessageType('');

    if (!feedbackData.user || !feedbackData.feedbackText) {
      setMessage('Please select a user and enter feedback text.');
      setMessageType('error');
      return;
    }

    try {
      await feedbackService.createFeedback(feedbackData);
      setMessage('Feedback submitted successfully!');
      setMessageType('success');
      setFeedbackData({ user: '', feedbackText: '' }); // Clear form
      setTimeout(() => setIsOpen(false), 2000); // Close popover after 2 seconds
    } catch (error) {
      console.error('Error submitting feedback:', error);
      setMessage('Failed to submit feedback. Please try again.');
      setMessageType('error');
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-full shadow-lg transition duration-300 ease-in-out transform hover:scale-105"
        >
          Feedback
        </button>
      )}

      {isOpen && (
        <div className="relative bg-white p-6 rounded-lg shadow-xl w-80">
          <button
            onClick={() => setIsOpen(false)}
            className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 text-xl"
          >
            &times;
          </button>
          <h3 className="text-lg font-semibold mb-4">Submit Feedback</h3>
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <SelectInput
                label="User"
                name="user"
                options={technicians}
                value={feedbackData.user}
                onChange={handleChange}
                required
              />
            </div>
            <div className="mb-4">
              <TextArea
                label="Feedback"
                name="feedbackText"
                value={feedbackData.feedbackText}
                onChange={handleChange}
                rows="4"
                required
              />
            </div>
            {message && (
              <p className={`mb-4 text-center ${messageType === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                {message}
              </p>
            )}
            <Button type="submit" className="w-full">
              Submit
            </Button>
          </form>
          <div className="text-center mt-4">
            <Link to="/feedback" className="text-blue-600 hover:underline" onClick={() => setIsOpen(false)}>
              View All Feedback
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeedbackButton;
