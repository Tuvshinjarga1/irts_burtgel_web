import numpy as np
import os
import pickle

class RLAgent:
    """
    Contextual Bandit based RL Agent using Q-learning.
    Learns to dynamically boost confidence threshold based on user feedback.
    """
    def __init__(self, model_path="rl_q_table.pkl"):
        self.model_path = model_path
        # State formulation:
        # sim_bin: 0 (<0.6), 1 (0.6-0.65), 2 (0.65-0.7), 3 (0.7-0.75), 4 (0.75-0.8), 5 (>0.8) => 6 states
        # sample_bin: 0 (1), 1 (2-3), 2 (4-6), 3 (7+) => 4 states
        
        self.actions = [0.0, 0.05, 0.10, 0.15, 0.20, 0.25]
        self.alpha = 0.1 # Learning rate
        
        self.q_table = None
        self._load_or_init()
            
    def _load_or_init(self):
        if os.path.exists(self.model_path):
            with open(self.model_path, "rb") as f:
                self.q_table = pickle.load(f)
        else:
            # Initialize with small positive values to encourage exploration initially
            self.q_table = np.ones((6, 4, len(self.actions))) * 0.1
            
    def _get_state(self, base_sim, num_samples):
        if base_sim < 0.6: sim_bin = 0
        elif base_sim < 0.65: sim_bin = 1
        elif base_sim < 0.7: sim_bin = 2
        elif base_sim < 0.75: sim_bin = 3
        elif base_sim < 0.8: sim_bin = 4
        else: sim_bin = 5
        
        if num_samples <= 1: sample_bin = 0
        elif num_samples <= 3: sample_bin = 1
        elif num_samples <= 6: sample_bin = 2
        else: sample_bin = 3
        
        return sim_bin, sample_bin
        
    def get_action_boost(self, base_sim, num_samples, exploring=False):
        state = self._get_state(base_sim, num_samples)
        
        # Epsilon-greedy exploration
        if exploring and np.random.uniform(0, 1) < 0.2:
            action_idx = np.random.randint(len(self.actions))
        else:
            action_idx = np.argmax(self.q_table[state])
            
        return self.actions[action_idx]
        
    def train_step(self, base_sim, num_samples, is_correct_person, threshold=0.78):
        """
        Q-learning update using environment feedback.
        When a user manually registers a face, that acts as our reward signal.
        """
        state = self._get_state(base_sim, num_samples)
        
        for action_idx, boost in enumerate(self.actions):
            final_sim = base_sim + boost
            predicted_match = final_sim >= threshold
            
            # Reward logic
            if is_correct_person:
                # The agent SHOULD boost enough to pass threshold for the correct person
                if predicted_match:
                    reward = 1.0 # Correctly identified
                else:
                    reward = -1.0 # Failed to identify (False Rejection)
            else:
                # The agent SHOULD NOT boost past threshold for a wrong person
                if predicted_match:
                    reward = -2.0 # False Accept (High penalty)
                else:
                    reward = 0.5 # Correctly rejected
                    
            # Q-Learning update
            current_q = self.q_table[state][action_idx]
            self.q_table[state][action_idx] = current_q + self.alpha * (reward - current_q)
            
        print(f"--> [RL Agent Training] State(sim_bin={state[0]}, sample_bin={state[1]}) | Is Target Person: {is_correct_person}")
        print(f"    Actions (boosts) : {self.actions}")
        print(f"    Updated Q-values : {[round(q, 3) for q in self.q_table[state]]}")
            
        self.save()
        
    def save(self):
        with open(self.model_path, "wb") as f:
            pickle.dump(self.q_table, f)
