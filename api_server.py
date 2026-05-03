import os
import random
import string
from flask import Flask, jsonify, request
from flask_cors import CORS

# Хранилище комнат в памяти
rooms = {}

app = Flask(__name__)
CORS(app)


@app.route('/api/room/<room_id>', methods=['GET'])
def get_room_info(room_id):
    """Получить информацию о комнате"""
    room = rooms.get(room_id)
    if room:
        return jsonify(room)
    return jsonify({'error': 'Room not found'}), 404


@app.route('/api/join', methods=['POST'])
def join_room_api():
    """Присоединиться к комнате"""
    data = request.json
    room_id = data.get('room_id')
    player_id = data.get('player_id')

    if not room_id or not player_id:
        return jsonify({'error': 'Missing room_id or player_id'}), 400

    success = join_room(room_id, player_id)
    if success:
        return jsonify({'success': True})
    return jsonify({'error': 'Failed to join room'}), 400


@app.route('/api/result', methods=['POST'])
def submit_result_api():
    """Отправить результат"""
    data = request.json
    room_id = data.get('room_id')
    player_id = data.get('player_id')
    result = data.get('result')

    if not all([room_id, player_id, result]):
        return jsonify({'error': 'Missing data'}), 400

    submit_result(room_id, player_id, result)
    return jsonify({'success': True})


@app.route('/api/create-room', methods=['POST'])
def create_room_api():
    """Создать новую комнату"""
    data = request.json
    player_id = data.get('player_id')

    if not player_id:
        return jsonify({'error': 'Missing player_id'}), 400

    room_id = create_room()
    join_room(room_id, player_id)

    # Формируем URL для приглашения
    web_app_url = os.environ.get('WEB_APP_URL', 'https://tim230613.github.io/colors/')
    invite_url = f"{web_app_url}?room={room_id}&api=https://colors.up.railway.app"

    return jsonify({
        'success': True,
        'room_id': room_id,
        'invite_url': invite_url
    })


@app.route('/api/ready-next', methods=['POST'])
def ready_next_round_api():
    """Игрок готов к следующему раунду"""
    data = request.json
    room_id = data.get('room_id')
    player_id = data.get('player_id')

    if not all([room_id, player_id]):
        return jsonify({'error': 'Missing data'}), 400

    if room_id not in rooms:
        return jsonify({'error': 'Room not found'}), 404

    room = rooms[room_id]
    if 'ready_next' not in room:
        room['ready_next'] = []

    if player_id not in room['ready_next']:
        room['ready_next'].append(player_id)

    # Если оба игрока готовы - генерируем новый цвет
    if len(room['ready_next']) == 2:
        room['target_color'] = {
            'hue': random.randint(0, 360),
            'lightness': random.randint(0, 80)
        }
        room['ready_next'] = []
        room['results'] = {}  # Очищаем результаты для нового раунда

    return jsonify({'success': True})


@app.route('/health', methods=['GET'])
def health_check():
    """Проверка здоровья сервера"""
    return jsonify({'status': 'healthy', 'rooms_count': len(rooms)})


def generate_room_id():
    """Генерирует уникальный ID комнаты"""
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))


def create_room():
    """Создает новую комнату"""
    room_id = generate_room_id()
    rooms[room_id] = {
        'players': [],
        'status': 'waiting',
        'target_color': None,
        'results': {}
    }
    return room_id


def join_room(room_id, player_id):
    """Присоединяет игрока к комнате"""
    if room_id not in rooms:
        return False

    room = rooms[room_id]
    if player_id not in room['players'] and len(room['players']) < 2:
        room['players'].append(player_id)

        # Если два игрока - начинаем игру
        if len(room['players']) == 2:
            room['status'] = 'ready'
            # Генерируем общий цвет для обоих
            room['target_color'] = {
                'hue': random.randint(0, 360),
                'lightness': random.randint(0, 80)
            }

        return True
    return False


def submit_result(room_id, player_id, result):
    """Сохраняет результат игрока"""
    if room_id in rooms:
        rooms[room_id]['results'][player_id] = result


if __name__ == "__main__":
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)