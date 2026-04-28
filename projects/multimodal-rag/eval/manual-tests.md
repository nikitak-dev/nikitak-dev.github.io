# Manual UI Tests — 5-Modal RAG Pipeline

Paste each question into the chat UI. Check the result visually.
Mark each test: `[ ]` not tested · `[x]` pass · `[~]` fail

---

## 1. Modalities — correct source type returned

- [x] **M-01** `Show me a video of someone typing on a keyboard.`
  - Source card: video file (not text)

- [x] **M-02** `Show me a visual diagram illustrating public key encryption with two linked keys.`
  - Source card: image with visible preview

- [x] **M-03** `What DevOps practices were described in the audio file?`
  - Source card: mp3 (not txt)

- [x] **M-04** `How many types of SQL joins are covered in the guide?`
  - Source card: PDF, answer says 6

---

## 2. Negatives — system declines, does not hallucinate

- [x] **N-01** `How do I configure Kubernetes pods and services for a microservices deployment?`
  - Declines, zero sources returned

- [x] **N-02** `How does quantum key distribution work in post-quantum cryptography?`
  - Declines even though "cryptography" overlaps with docs

---

## 3. Cross-modal — multiple source types together

- [x] **C-01** `How do DevOps automation practices support cloud architecture scalability?`
  - Sources include both mp3 and txt

---

## 4. Language

- [x] **L-01** `Что такое DDoS-атака и как от неё защититься?`
  - Answer in Russian

---

## 5. Disambiguation — two videos in the index

- [x] **D-01** `Which video shows an abstract plexus animation with polygons and connecting lines?`
  - Returns 12716-241674181.mp4, not 232538_medium.mp4