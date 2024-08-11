from flask import Blueprint, session, render_template, flash, request, redirect, url_for, jsonify
import requests
from flask_login import login_user, login_required, logout_user, current_user
import json
from entry import mail
from entry.models import User, Rider, Parcel, FAQ
from sqlalchemy.exc import IntegrityError
from entry import app, db, bcrypt
from flask_mail import Message, Mail
from sqlalchemy import or_
import stripe
from entry.forms import LoginRiderForm, RegistrationForm, LoginForm, UpdateAccountForm, RiderRegistrationForm, ParcelForm, UpdateRiderForm, ForgotPasswordForm, ResetPasswordForm
import secrets
from geopy.distance import geodesic
from geopy.geocoders import Nominatim
import retrying
import geopy.exc
from flask import session


parcel = Blueprint('parcel', __name__)


@parcel.route('/track_parcel')
def track_parcel():
    # Implement the functionality for sending parcels here
    return render_template('track_parcel.html')

@parcel.route('/get_parcel_status')
def get_parcel_status():
    tracking_number = request.args.get('tracking_number')
    if tracking_number:
        parcel = Parcel.query.filter_by(tracking_number=tracking_number).first()
        if parcel:
            return jsonify({
                'status': parcel.status,
                'expected_arrival': parcel.expected_arrival
            }), 200
        else:
            return jsonify({'error': 'Parcel not found'}), 404
    else:
        return jsonify({'error': 'Tracking number not provided'}), 400


@parcel.route('/request_pickup', methods=['GET', 'POST'])
def request_pickup():
    form = ParcelForm()
    step = request.args.get('step', '1')

    if request.method == 'POST':
        if step == '1':
            session['delivery_location'] = form.delivery_location.data
            return redirect(url_for('parcel.request_pickup', step='2'))

        elif step == '2':
            session['pickup_location'] = form.pickup_location.data
            return redirect(url_for('parcel.request_pickup', step='3'))
        elif step == '3':
            response = requests.post(url_for('parcel.get_coordinates', _external=True), json={
                'pickup_location': session.get('pickup_location'),
                'delivery_location': session.get('delivery_location')
            })

            if response.ok:
                data = response.json()
                session['pickup_coords'] = {
                    'lat': data.get('pickup_lat'),
                    'lng': data.get('pickup_lng')
                }
                session['delivery_coords'] = {
                    'lat': data.get('delivery_lat'),
                    'lng': data.get('delivery_lng')
                }
                return redirect(url_for('parcel.request_pickup', session=session, step='4'))
            else:
                flash('Unable to get coordinates. Please try again.', 'error')
                return redirect(url_for('parcel.request_pickup', step='2'))

        elif step == '4':
            # Save receiver's information
            session['receiver_name'] = form.receiver_name.data
            session['receiver_contact'] = form.receiver_contact.data

            # Create the parcel entry in the database
            parcel = Parcel(
                sender_name=current_user.username,
                sender_email=current_user.email,
                sender_contact="011122",  # Assuming this is fetched from somewhere else or hardcoded for now
                receiver_name=session['receiver_name'],
                receiver_contact=session['receiver_contact'],
                pickup_location=session['pickup_location'],
                delivery_location=session['delivery_location'],
                description="pipi"
            )

            db.session.add(parcel)
            db.session.commit()

            allocation_result = allocate_parcel()
            if allocation_result['success']:
                send_rider_details_email(parcel.sender_email, allocation_result, parcel.tracking_number)
                flash('Rider Allocated. Check your email for more details', 'success')
                return redirect(url_for('payment.verify_payment'))
            else:
                flash('Allocation in progress. Please wait for a rider to be assigned', 'success')
                return redirect(url_for('payment.verify_payment'))

    return render_template('request_pickup.html', form=form, step=step)


@parcel.route('/get_coordinates', methods=['POST'])
def get_coordinates():
    data = request.get_json()
    pickup_location = data.get('pickup_location')
    delivery_location = data.get('delivery_location')

    pickup_lat, pickup_lng = get_lat_lng(pickup_location)
    delivery_lat, delivery_lng = get_lat_lng(delivery_location)

    # Check if both locations were successfully fetched
    if None in (pickup_lat, pickup_lng, delivery_lat, delivery_lng):
        return jsonify({"error": "Could not fetch coordinates for one or both locations"}), 400

    return jsonify({
        "pickup_lat": pickup_lat,
        "pickup_lng": pickup_lng,
        "delivery_lat": delivery_lat,
        "delivery_lng": delivery_lng
    })


def get_lat_lng(location):
    user_agent = 'MyGeocodingApp/1.0 (victorcyrus01@gmail.com)'
    geolocator = Nominatim(user_agent=user_agent)
    location = geolocator.geocode(location)
    return location.latitude, location.longitude


def allocate_parcel():
    """
    Allocates pending parcel deliveries to available riders
    """
    pending_parcels = Parcel.query.filter_by(status='pending').all()
    available_riders = Rider.query.filter_by(status='available').all()
    allocated_parcels = []

    for parcel in pending_parcels:
        if not available_riders:
            break  # Break if no available riders left

        pickup_location = parcel.pickup_location
        closest_rider = None
        min_distance = float('inf')

        available_riders_excluding_denied = [rider for rider in available_riders if rider.id != parcel.rider_id]

        for rider in available_riders_excluding_denied:
            distance = calculate_distance(pickup_location, rider.current_location)
            if distance < min_distance:
                closest_rider = rider
                min_distance = distance

        if closest_rider:
            parcel.status = 'allocated'
            parcel.rider_id = closest_rider.id
            closest_rider.status = 'unavailable'
            db.session.commit()
            notify_rider_new_assignment(closest_rider.email, parcel, closest_rider)
            allocated_parcels.append(parcel)

    if allocated_parcels:
        closest_rider_details = {
            'id': closest_rider.id,
            'name': closest_rider.name,
            'contact': closest_rider.contact_number,
            'vehicle_type': closest_rider.vehicle_type,
            'vehicle_registration': closest_rider.vehicle_registration
        }
        result = {
            'success': True,
            'allocated_parcels': allocated_parcels,
            'closest_rider': closest_rider_details
        }
    else:
        result = {
            'success': False,
            'message': 'No available riders, parcel allocation pending'
        }

    return result


@retrying.retry(wait_exponential_multiplier=1000, wait_exponential_max=10000)
def geocode_with_retry(geolocator, location):
    """
    retrying decorator incase the nominatim encouters challenges while loading
    """
    return geolocator.geocode(location)


def calculate_distance(location1, location2):
    """
    Implements distance calculation logic
    It uses the location format: (latitude, longitude)
    """
    user_agent = 'MyGeocodingApp/1.0 (victorcyrus01@gmail.com)'
    geolocator = Nominatim(user_agent=user_agent)
    location1 = geolocator.geocode(location1)
    location2 = geolocator.geocode(location2)
    current = location1.latitude, location1.longitude
    pickup_location = location2.latitude, location2.longitude

    distance = geodesic(pickup_location, current).kilometers
    return distance


def notify_rider_new_assignment(rider_email, parcel, rider):
    """
    Trigger notification when assigning a parcel to a rider
    """
    msg = Message('New Delivery Assignment', recipients=[rider_email])
    html_content = render_template('new_assignment_email.html', parcel=parcel, rider=rider)
    msg.html = html_content
    mail.send(msg)


def send_rider_details_email(recipient_email, allocation_result, tracking_number):
    msg = Message('Parcel Allocation Details', recipients=[recipient_email])
    html_content = render_template('rider_details_email.html', **allocation_result, tracking_number=tracking_number)
    msg.html = html_content
    mail.send(msg)


@parcel.route('/update_assignment', methods=['POST'])
def update_assignment():
    data = request.json
    parcel_id = data.get('parcel_id')
    action = data.get('action')

    assignment = Parcel.query.filter_by(id=parcel_id).filter(or_(Parcel.status == 'allocated', Parcel.status == 'shipped', Parcel.status == 'in_progress')).first()
    if assignment:
        if action == 'accept':
            assignment.status = 'in_progress'
            db.session.commit()
            flash("You have accepted parcel pick-up! We are waiting", 'success')
            return jsonify({'success': True})
        elif action == 'reject':
            rider = Rider.query.filter_by(id=assignment.rider_id).first()
            if rider:
                rider.status = 'available'
            assignment.status = 'pending'
            assignment.rider_id = None
            db.session.commit()
            flash("You have Rejected parcel pickup!, contact admin if that was unintentional", 'danger')
            allocate_parcel()
        elif action == 'shipped':
            assignment.status = 'shipped'
            db.session.commit()
            return jsonify({'success': True})
        elif action == 'arrived':
            assignment.status = 'arrived'
            rider = Rider.query.filter_by(id=assignment.rider_id).first()
            if rider:
                rider.status = 'available'
            db.session.commit()
            return jsonify({'success': True})
        else:
            return jsonify({'error': 'Invalid action'}), 400
    else:
        return jsonify({'error': 'Assignment not found or already accepted/denied'}), 404
    return redirect(url_for('main.home'))


@parcel.route('/view_parcel_history', methods=['GET', 'POST'])
def view_parcel_history():
    if current_user.is_authenticated:
        parcels = Parcel.query.filter_by(sender_email=current_user.email).all()

        # Separate parcels by status
        allocated_parcels = [parcel for parcel in parcels if parcel.status == 'allocated']
        in_progress_parcels = [parcel for parcel in parcels if parcel.status == 'in_progress']
        shipped_parcels = [parcel for parcel in parcels if parcel.status == 'shipped']
        arrived_parcels = [parcel for parcel in parcels if parcel.status == 'arrived']

        return render_template('view_parcel_history.html',
                               allocated_parcels=allocated_parcels,
                               in_progress_parcels=in_progress_parcels,
                               shipped_parcels=shipped_parcels,
                               arrived_parcels=arrived_parcels)
        return render_template('view_parcel_history.html', parcels=parcels)
    else:
        return render_template('view_parcel_history.html')
        flash('Log in to view your parcels history!', 'danger')
